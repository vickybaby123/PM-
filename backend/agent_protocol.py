from typing import List, Dict, Any, Optional, Literal
from typing_extensions import TypedDict
from pydantic import BaseModel, Field
import time

# 1. 定义 AgentState (TypedDict)
# 使用 TypedDict 可以让 LangGraph 或类似的框架在流转状态时保持轻量级且具类型约束
class AgentState(TypedDict):
    """
    PM-Copilot 代理状态定义
    """
    messages: List[Dict[str, Any]]  # 对话历史，推荐使用 {'role': 'user', 'content': '...'}
    next_agent: str                # 下一个执行的代理名称 (如 'senior_pm', 'risk_analyzer')
    context_summary: str           # 当前任务摘要，关键点提取，用于压缩上下文节省 Token
    shared_data: Dict[str, Any]    # 结构化业务数据 (如 {'project_id': '123', 'risk_score': 0.8})
    iteration_count: int           # 循环计数，防止代理间无限循环

# 2. 定义 SubAgentResponse (Pydantic Model)
# 用于 API 返回和子代理输出验证，确保结构化输出的严谨性
class SubAgentMetadata(BaseModel):
    execution_time_ms: float = Field(..., description="任务耗时")
    token_usage: Dict[str, int] = Field(default_factory=lambda: {"prompt": 0, "completion": 0}, description="Token 消耗统计")

class SubAgentResponse(BaseModel):
    """
    子代理标准响应格式
    """
    content: str = Field(..., description="代理回复的文本内容")
    need_escalation: bool = Field(False, description="是否需要主代理或人工干预")
    proposed_next: Optional[str] = Field(None, description="建议的下一个处理节点")
    updated_summary: Optional[str] = Field(None, description="生成的最新任务摘要")
    metadata: SubAgentMetadata = Field(..., description="基础元数据")

# 3. 核心逻辑：自动压缩与状态更新
class AgentProtocolManager:
    """
    负责状态转换与上下文管理的逻辑类
    """
    
    @staticmethod
    def update_state(current_state: AgentState, response: SubAgentResponse) -> AgentState:
        """
        根据子代理响应更新主状态，并执行摘要同步
        """
        new_state = current_state.copy()
        
        # 更新消息列表
        new_state["messages"].append({"role": "assistant", "content": response.content})
        
        # 更新任务摘要 (如果子代理提供了新的摘要)
        if response.updated_summary:
            new_state["context_summary"] = response.updated_summary
            
        # 确定流转节点
        new_state["next_agent"] = response.proposed_next or "orchestrator"
        
        # 自动触发上下文压缩机制
        new_state["messages"] = AgentProtocolManager._compress_history(new_state["messages"])
        
        return new_state

    @staticmethod
    def _compress_history(messages: List[Dict[str, Any]], max_rounds: int = 5) -> List[Dict[str, Any]]:
        """
        上下文压缩策略：
        如果对话轮数超过 max_rounds，保留首轮(System Prompt)和最近 5 轮，
        中间内容通过 context_summary 在下一次 Prompt 中进行补偿
        """
        if len(messages) <= max_rounds * 2: # 一轮包含 user 和 assistant
            return messages
            
        # 保留逻辑：通常保留背景(前两回) 和 最近(后几回)
        kept_messages = messages[:2] + messages[-(max_rounds * 2):]
        return kept_messages

# FastAPI 接口示例
"""
from fastapi import FastAPI

app = FastAPI()

@app.post("/agent/invoke", response_model=SubAgentResponse)
async def invoke_pm_agent(state: AgentState):
    # 1. 这里进行业务逻辑处理
    # 2. 调用 LLM 并填充 SubAgentResponse
    # 3. 返回响应，由调用方通过 ProtocolManager 更新状态
    pass
"""
