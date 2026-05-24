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
llm = ChatGoogleGenerativeAI(
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

async def main_router(state: AgentState, config: RunnableConfig):
    start_time = time.time()
    session_id = config.get("configurable", {}).get("thread_id", "default")
    messages = state["messages"]
    last_message = messages[-1]["content"] if messages else ""
    
    # 模拟 RAG 按需加载背景知识
    context_addon = await ctx_manager.rag_retrieve(last_message, None)
    
    prompt = f"""
    你是一个意图分发器。请分析用户输入，并决定由哪一个子代理处理。
    输入内容: "{last_message}"
    背景补充: {context_addon}
    
    子代理列表:
    - feishu_agent: 处理文档检索、飞书 IM 消息、日程安排建议
    - plm_agent: 处理物料查询、BOM、变更流程、供应商数据
    - schedule_agent: 处理项目阶段(TR/Gate)计划、时间同步
    
    如果无法确定意图，或者意图模糊，请回复 'ask_clarification'。
    
    仅返回子代理名称或 'ask_clarification'。
    """
    
    response = await llm.ainvoke(prompt, config=config)
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
    
    return {"next_agent": decision}

async def feishu_agent(state: AgentState, config: RunnableConfig):
    start_time = time.time()
    session_id = config.get("configurable", {}).get("thread_id", "default")
    
    prompt = f"作为 FeishuAgent，处理以下任务摘要并给出专业回复：{state['context_summary']}"
    response = await llm.ainvoke(prompt, config=config)
    
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
    # 模拟从缓存加载 BOM (与 PLM 系统对接)
    async def mock_plm_fetcher(mid): 
        return {"id": mid, "structure": "A->B->C", "status": "released"}
    
    bom_data = await ctx_manager.fetch_bom_with_cache("HA-9001", mock_plm_fetcher)
    
    prompt = f"作为 PLMAgent，根据 BOM 数据 {bom_data} 分析以下工程需求：{state['context_summary']}"
    response = await llm.ainvoke(prompt, config=config)
    
    return {
        "messages": [{"role": "assistant", "content": f"[PLM] {response.content}"}],
        "next_agent": "summarizer"
    }

async def schedule_agent(state: AgentState, config: RunnableConfig):
    """
    进度子代理：处理 IPD 计划
    """
    prompt = f"作为 ScheduleAgent，分析项目进度风险：{state['context_summary']}"
    response = await llm.ainvoke(prompt, config=config)
    
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
        
        summary_res = await llm.ainvoke(summary_prompt, config=config)
        
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
    result = await ctx_manager.run_reflection(state, llm)
    return {**result, "next_agent": END}

# --- 图构建与路由逻辑 ---

def route_decision(state: AgentState):
    """
    动态路由逻辑
    """
    next_node = state.get("next_agent", "main_router")
    if next_node in ["feishu_agent", "plm_agent", "schedule_agent"]:
        return next_node
    if next_node == "ask_clarification":
        return END
    return "main_router"

# 初始化图
workflow = StateGraph(AgentState)

# 添加节点
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

workflow.add_node("retrieval_agent", retrieval_agent)
workflow.add_edge("retrieval_agent", "summarizer")

# 设置入口
workflow.set_entry_point("main_router")

# 添加边：带条件的路由
workflow.add_conditional_edges(
    "main_router",
    route_decision,
    {
        "feishu_agent": "feishu_agent",
        "plm_agent": "plm_agent",
        "schedule_agent": "schedule_agent",
        "END": END
    }
)

def route_summarizer(state: AgentState):
    if state.get("next_agent") == "reflection":
        return "reflection"
    return END

# 所有子代理完成任务后进入 Summarizer
workflow.add_edge("feishu_agent", "summarizer")
workflow.add_edge("plm_agent", "summarizer")
workflow.add_edge("schedule_agent", "summarizer")

# Summarizer 结束后判断是结束还是进行 Reflection
workflow.add_conditional_edges(
    "summarizer",
    route_summarizer,
    {
        "reflection": "reflection",
        "END": END
    }
)

# Reflection 结束后彻底完成本轮
workflow.add_edge("reflection", END)

# 持久化存储
memory = MemorySaver()

# 编译应用
app_graph = workflow.compile(checkpointer=memory)

# 性能说明：通过 `config` 传入 `recursion_limit` 和 `thread_id`
# 使用实例:
# await app_graph.ainvoke(initial_state, config={"configurable": {"thread_id": "user_123"}})
