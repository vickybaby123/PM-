import os
from typing import Annotated, Literal, TypedDict
from datetime import datetime

from langchain_google_genai import ChatGoogleGenerativeAI
from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver
from langchain_core.messages import HumanMessage, AIMessage, BaseMessage
from langchain_core.runnables import RunnableConfig

try:
    from .agent_protocol import AgentState, SubAgentResponse, SubAgentMetadata
    from .context_manager import ContextManager
except ImportError:
    from agent_protocol import AgentState, SubAgentResponse, SubAgentMetadata
    from context_manager import ContextManager

# 初始化模型
# 使用 Gemini 1.5 Flash 以获得最快的响应速度
def get_llm():
    return ChatGoogleGenerativeAI(
        model="gemini-1.5-flash",
        google_api_key=os.getenv("GEMINI_API_KEY"),
        temperature=0.2
    )

# 初始化上下文管理器
ctx_manager = ContextManager(token_limit=4000)

# --- Nodes 定义 ---

try:
    from .logger import trace_logger, ExecutionLog
except ImportError:
    from logger import trace_logger, ExecutionLog
import time

# ... existing code ...

import asyncio

async def main_router(state: AgentState, config: RunnableConfig):
    start_time = time.time()
    session_id = config.get("configurable", {}).get("thread_id", "default")
    messages = state["messages"]
    last_message = messages[-1]["content"] if messages else ""
    
    # 1. 最小化原则 (Minimization Principle)
    # 对常识或纯对话进行启发式分析，避免滥用外部工具
    keywords_needed = [
        "tr", "gate", "bom", "物料", "器件", "型号", "供应商", "计划", "进度", "延期", "规范", "标准", "知识库", 
        "主计划", "变更", "马达", "风险", "通知", "重新测试", "格式", "日期", "主计划表", "供应商状态"
    ]
    is_general_or_chitchat = not any(kw in last_message.lower() for kw in keywords_needed)
    
    # 2. 异步执行 (Asynchronous Retrieval)
    # 仅当确定需要外部物料和知识细节时，并行触发 RAG 与 PLM-BOM 的多源检索
    if is_general_or_chitchat:
        context_addon = "用户的问题属于通用沟通或自我介绍，无需调用外部物理资源或 RAG 检索。热内存中处于健康态。"
    else:
        # 并联触发多个检索数据源（RAG 检索 与 PLM-BOM 缓冲），绝不采取链式串行检索
        async def fetch_rag():
            return await ctx_manager.rag_retrieve(last_message, None)
            
        async def fetch_plm_mock():
            async def get_mid(mid):
                return {"id": mid, "structure": "A->B->BOM-Structure", "status": "released"}
            return await ctx_manager.fetch_bom_with_cache("HA-9001", get_mid)
            
        # 并行执行
        rag_task = fetch_rag()
        plm_task = fetch_plm_mock()
        
        try:
            ret_rag_data, ret_plm_data = await asyncio.gather(rag_task, plm_task)
            context_addon = f"[RAG Data]: {ret_rag_data}\n[PLM Data]: {ret_plm_data}"
        except Exception as e:
            context_addon = f"并行检索出现受控异常却已安全降级: {str(e)}"

    prompt = f"""
    你是一个意图分发器。请分析用户输入，并决定由哪一个子代理处理。
    输入内容: "{last_message}"
    背景补充: {context_addon}
    
    子代理列表:
    - feishu_agent: 处理文档检索、飞书 IM 消息、日程安排建议
    - plm_agent: 处理物料查询、BOM、变更流程、供应商数据
    - schedule_agent: 处理项目阶段(TR/Gate)计划、时间同步
    - retrieval_agent: 当用户指明或者需要检索流程规范、质量标准、参考知识库深度文章档案等专业信息时使用
    
    如果无法确定意图，或者意图模糊，请回复 'ask_clarification'。
    
    仅返回子代理名称或 'ask_clarification'。
    """
    
    response = await get_llm().ainvoke(prompt, config=config)
    decision = response.content.strip().lower()

    # Log transition
    trace_logger.log(ExecutionLog(
        session_id=session_id,
        agent_name="MainRouter",
        action="Intent Classification",
        input_query=last_message,
        execution_time_ms=(time.time() - start_time) * 1000,
        details={"decision": decision}
    ))
    
    if decision == "ask_clarification":
        clarify_prompt = f"用户的问题不太明确：'{last_message}'。作为 PM-CoPilot，请抛出一个友好且具体的问题，要求其提供更多 IPD 流程阶段、特定物料单号或具体背景信息。"
        clarify_res = await get_llm().ainvoke(clarify_prompt, config=config)
        return {
            "messages": [{"role": "assistant", "content": clarify_res.content}],
            "next_agent": "ask_clarification"
        }
    
    return {"next_agent": decision}

async def feishu_agent(state: AgentState, config: RunnableConfig):
    start_time = time.time()
    session_id = config.get("configurable", {}).get("thread_id", "default")
    
    prompt = f"作为 FeishuAgent，处理以下任务摘要并给出专业回复：{state['context_summary']}"
    response = await get_llm().ainvoke(prompt, config=config)
    
    trace_logger.log(ExecutionLog(
        session_id=session_id,
        agent_name="FeishuAgent",
        action="Docs & IM Retrieval",
        execution_time_ms=(time.time() - start_time) * 1000
    ))
    
    return {
        "messages": [{"role": "assistant", "content": f"[Feishu] {response.content}"}],
        "next_agent": "summarizer"
    }

async def plm_agent(state: AgentState, config: RunnableConfig):
    """
    PLM 子代理：处理硬核工程数据
    """
    start_time = time.time()
    session_id = config.get("configurable", {}).get("thread_id", "default")
    
    # 模拟从缓存加载 BOM (与 PLM 系统对接)
    async def mock_plm_fetcher(mid): 
        return {"id": mid, "structure": "A->B->C", "status": "released"}
    
    bom_data = await ctx_manager.fetch_bom_with_cache("HA-9001", mock_plm_fetcher)
    
    prompt = f"作为 PLMAgent，根据 BOM 数据 {bom_data} 分析以下工程需求：{state['context_summary']}"
    response = await get_llm().ainvoke(prompt, config=config)
    
    trace_logger.log(ExecutionLog(
        session_id=session_id,
        agent_name="PLMAgent",
        action="BOM & Part Analysis",
        execution_time_ms=(time.time() - start_time) * 1000,
        details={"part_id": "HA-9001"}
    ))
    
    return {
        "messages": [{"role": "assistant", "content": f"[PLM] {response.content}"}],
        "next_agent": "summarizer"
    }

async def schedule_agent(state: AgentState, config: RunnableConfig):
    """
    进度子代理：处理 IPD 计划
    """
    start_time = time.time()
    session_id = config.get("configurable", {}).get("thread_id", "default")
    
    prompt = f"作为 ScheduleAgent，分析项目进度风险：{state['context_summary']}"
    response = await get_llm().ainvoke(prompt, config=config)
    
    trace_logger.log(ExecutionLog(
        session_id=session_id,
        agent_name="ScheduleAgent",
        action="Gantt & Timeline Risk Analysis",
        execution_time_ms=(time.time() - start_time) * 1000,
        details={"plan_target": "IPD-Main-Plan"}
    ))
    
    return {
        "messages": [{"role": "assistant", "content": f"[Schedule] {response.content}"}],
        "next_agent": "summarizer"
    }

async def summarizer(state: AgentState, config: RunnableConfig):
    """
    摘要与清理节点：执行滑动窗口与 Reflection 触发
    """
    messages = state["messages"]
    token_count = ctx_manager.get_token_count(messages)
    
    # 滑动窗口机制：当 Token 超过 4000 时触发 Reflection
    if token_count > ctx_manager.token_limit:
        return {"next_agent": "reflection"}
    
    # 常规压缩：如果消息超过 10 条
    if len(messages) > 10:
        summary_prompt = f"请总结以下对话的关键信息，由于上下文过长，该摘要将作为后续工作的唯一引用：\n" + \
                         "\n".join([f"{m['role']}: {m['content']}" for m in messages])
        
        summary_res = await get_llm().ainvoke(summary_prompt, config=config)
        
        new_messages = messages[:1] + messages[-2:] 
        return {
            "messages": new_messages,
            "context_summary": summary_res.content,
            "next_agent": END
        }
    
    return {"next_agent": END}

async def reflection_node(state: AgentState, config: RunnableConfig):
    """
    Reflection 代理：提炼进度快照
    """
    result = await ctx_manager.run_reflection(state, get_llm())
    return {**result, "next_agent": END}

# --- 图构建与路由逻辑 ---

def route_decision(state: AgentState):
    """
    动态路由逻辑
    """
    next_node = state.get("next_agent", "main_router")
    if next_node in ["feishu_agent", "plm_agent", "schedule_agent", "retrieval_agent"]:
        return next_node
    if next_node == "ask_clarification":
        return END
    return "main_router"

# 初始化图
workflow = StateGraph(AgentState)

# RAG 检索子代理定义
async def retrieval_agent(state: AgentState, config: RunnableConfig):
    """
    RAG 检索子代理：专门负责从知识库提取信息
    """
    start_time = time.time()
    session_id = config.get("configurable", {}).get("thread_id", "default")
    last_message = state["messages"][-1]["content"] if state["messages"] else ""
    
    # 模拟检索逻辑
    affected_files = ["IPD流程规范.pdf", "2024质量手册.xlsx"]
    retrieved_content = f"从 {affected_files[0]} 中检索到关于质量控制的关键点..."
    
    trace_logger.log(ExecutionLog(
        session_id=session_id,
        agent_name="RetrievalAgent",
        action="Knowledge Retrieval",
        input_query=last_message,
        affected_files=affected_files,
        execution_time_ms=(time.time() - start_time) * 1000,
        details={"result_summary": retrieved_content}
    ))
    
    return {
        "context_summary": f"{state.get('context_summary', '')}\n[RAG 知识库结果]: {retrieved_content}",
        "next_agent": "summarizer"
    }

# 第一步：先添加所有节点
workflow.add_node("main_router", main_router)
workflow.add_node("feishu_agent", feishu_agent)
workflow.add_node("plm_agent", plm_agent)
workflow.add_node("schedule_agent", schedule_agent)
workflow.add_node("summarizer", summarizer)
workflow.add_node("reflection", reflection_node)
workflow.add_node("retrieval_agent", retrieval_agent)

# 第二步：设置入口
workflow.set_entry_point("main_router")

# 第三步：再添加所有边
workflow.add_conditional_edges(
    "main_router",
    route_decision,
    {
        "feishu_agent": "feishu_agent",
        "plm_agent": "plm_agent",
        "schedule_agent": "schedule_agent",
        "retrieval_agent": "retrieval_agent",
        "END": END
    }
)
workflow.add_edge("feishu_agent", "summarizer")
workflow.add_edge("plm_agent", "summarizer")
workflow.add_edge("schedule_agent", "summarizer")
workflow.add_edge("retrieval_agent", "summarizer")

def route_summarizer(state: AgentState):
    if state.get("next_agent") == "reflection":
        return "reflection"
    return END

workflow.add_conditional_edges(
    "summarizer",
    route_summarizer,
    {
        "reflection": "reflection",
        "END": END
    }
)
workflow.add_edge("reflection", END)

# 持久化存储
memory = MemorySaver()

# 编译应用
app_graph = workflow.compile(checkpointer=memory)

# 性能说明：通过 `config` 传入 `recursion_limit` 和 `thread_id`
# 使用实例:
# await app_graph.ainvoke(initial_state, config={"configurable": {"thread_id": "user_123"}})
