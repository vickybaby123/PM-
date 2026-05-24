import os
import sys
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional

# Set up paths so relative/absolute imports resolve correctly in all runtimes (local, Vercel, etc.)
current_dir = os.path.dirname(os.path.abspath(__file__))
parent_dir = os.path.dirname(current_dir)
if current_dir not in sys.path:
    sys.path.insert(0, current_dir)
if parent_dir not in sys.path:
    sys.path.insert(0, parent_dir)

try:
    from .main_graph import app_graph
    from .agent_protocol import AgentState
    from .logger import trace_logger
except ImportError:
    from main_graph import app_graph
    from agent_protocol import AgentState
    from logger import trace_logger

app = FastAPI(
    title="PM-CoPilot Backend",
    description="FastAPI service for the LangGraph-powered PM-CoPilot Agent",
    version="1.0.0"
)

# Enable CORS for all origins, methods, and headers
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Request Models
class ChatMessage(BaseModel):
    role: str = Field(..., description="Role of the message sender (user or assistant)")
    content: str = Field(..., description="The message content")

class ChatRequest(BaseModel):
    messages: List[ChatMessage] = Field(..., description="List of messages representing full chat history")
    next_agent: str = Field("main_router", description="The next agent to route to")
    context_summary: str = Field("", description="Summarized context for optimization")
    shared_data: Dict[str, Any] = Field(default_factory=dict, description="Custom shared business data")
    iteration_count: int = Field(0, description="Loop counter to prevent state infinity")
    thread_id: str = Field("default", description="The unique session or thread-id for checkpointer")

@app.get("/")
def read_root():
    return {
        "status": "PM-CoPilot Agent is running!",
        "version": "1.0.0",
        "endpoints": {
            "GET /": "Health check",
            "POST /chat": "Invoke the LangGraph PM-CoPilot Workflow",
            "GET /logs/{thread_id}": "Get trace logs for a specific thread/session"
        }
    }

@app.post("/chat")
async def chat_endpoint(request: ChatRequest):
    """
    Primary endpoint to invoke the LangGraph PM-CoPilot agentic flow.
    Fulfills state transformations and passes checkpointer logic.
    """
    # 1. Adapt Pydantic models to typed AgentState dictionary
    state: AgentState = {
        "messages": [msg.model_dump() for msg in request.messages],
        "next_agent": request.next_agent,
        "context_summary": request.context_summary,
        "shared_data": request.shared_data,
        "iteration_count": request.iteration_count
    }
    
    # 2. Config containing thread id
    config = {
        "configurable": {
            "thread_id": request.thread_id
        }
    }
    
    try:
        # 3. Invoke the LangGraph workflow asynchronously
        response_state = await app_graph.ainvoke(state, config=config)
        
        # 4. Fetch the session trace logs generated during the run
        logs = trace_logger.get_session_logs(request.thread_id)
        
        return {
            "status": "success",
            "state": response_state,
            "logs": logs
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Error executing LangGraph workflow: {str(e)}"
        )

@app.get("/logs/{thread_id}")
def get_logs(thread_id: str):
    """
    Retrieve trace logs/execution logs for a specific session thread.
    Useful for visualizing multi-agent transitions in the UI.
    """
    try:
        logs = trace_logger.get_session_logs(thread_id)
        return {
            "thread_id": thread_id,
            "logs": logs
        }
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to query trace logs: {str(e)}"
        )

if __name__ == "__main__":
    import uvicorn
    # Local dev server
    uvicorn.run("main:app", host="0.0.0.0", port=3000, reload=True)
