import time
import json
from typing import List, Dict, Any, Optional
try:
    from .agent_protocol import AgentState
except ImportError:
    from agent_protocol import AgentState

class ContextManager:
    """
    PM-Copilot 上下文管理系统
    集成滑动窗口、Reflection 提炼与按需加载逻辑
    """
    
    def __init__(self, token_limit: int = 4000):
        self.token_limit = token_limit
        # 针对 BOM 等不常变动数据的内存缓存
        self._bom_cache: Dict[str, Dict[str, Any]] = {}
        self._cache_ttl = 3600  # 1小时缓存
        self._cache_timestamps: Dict[str, float] = {}

    def get_token_count(self, messages: List[Dict[str, Any]]) -> int:
        """
        估算 Token 数 (简易版：按字符数/4 估算，生产环境建议用 tiktoken)
        """
        total_chars = sum(len(m.get("content", "")) for m in messages)
        return total_chars // 4

    async def run_reflection(self, state: AgentState, llm: Any) -> Dict[str, Any]:
        """
        Reflection 代理逻辑：提炼执行快照并压缩历史
        """
        messages = state["messages"]
        history_str = "\n".join([f"{m['role']}: {m['content']}" for m in messages])
        
        prompt = f"""
        你是一个项目经理的反思代理 (Reflection Agent)。
        请从以下对话历史中提炼出结构化的进度快照 (Key-Value 形式)。
        
        对话历史:
        {history_str}
        
        要求:
        1. 必须输出 JSON 格式。
        2. 关注：关键路径状态、物料瓶颈、当前延期风险、待办负责人。
        3. 忽略琐碎的礼貌用语。
        """
        
        response = await llm.ainvoke(prompt)
        try:
            # 简单清理一下返回的内容，确保是 JSON
            clean_json = response.content.strip()
            if "```json" in clean_json:
                clean_json = clean_json.split("```json")[1].split("```")[0].strip()
            
            snapshot = json.loads(clean_json)
        except Exception:
            snapshot = {"summary": "提炼失败，详见上下文回复", "raw_content": response.content[:100]}
            
        # 更新共享数据中的快照
        updated_shared_data = state.get("shared_data", {}).copy()
        updated_shared_data["project_snapshot"] = snapshot
        
        # 返回更新：清空原始长对话，仅保留最新的 User 意图和 Snapshot 摘要
        return {
            "messages": messages[-1:], # 只保留最后一条
            "shared_data": updated_shared_data,
            "context_summary": f"历史快照已更新: {json.dumps(snapshot, ensure_ascii=False)}"
        }

    # --- 按需加载 (Dynamic RAG) ---
    async def fetch_bom_with_cache(self, material_id: str, fetcher_fn: Any) -> Dict[str, Any]:
        """
        缓存策略：对 PLM 系统的 BOM 结构进行内存缓存
        """
        current_time = time.time()
        if material_id in self._bom_cache:
            if current_time - self._cache_timestamps[material_id] < self._cache_ttl:
                print(f"[Cache Hit] Material: {material_id}")
                return self._bom_cache[material_id]
        
        # 缓存失效或不存在，调用真接口
        print(f"[Cache Miss] Fetching from PLM: {material_id}")
        data = await fetcher_fn(material_id)
        
        self._bom_cache[material_id] = data
        self._cache_timestamps[material_id] = current_time
        return data

    async def rag_retrieve(self, query: str, vector_store: Any) -> str:
        """
        Dynamic RAG: 仅在需要时拉取细节点
        """
        # 这里集成具体的向量数据库查询逻辑
        # docs = await vector_store.asimilar_search(query, k=3)
        # return "\n".join([d.page_content for d in docs])
        return f"[RAG MOCK DATA for {query}]"
