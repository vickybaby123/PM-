import { GoogleGenAI, Part } from "@google/genai";
import { MemoryVault, Message, Attachment, ExecutionLog } from "../types";

const SYSTEM_PROMPT = `
你是 PM-CoPilot，一位拥有 10 年家电行业经验的 IPD 专家级项目经理助手。

你的知识体系包括：
- IPD（集成产品开发）全流程：概念/计划/开发/验证/发布/生命周期各阶段
- 家电行业认证周期：CCC（约3-6个月）、CE（1-3个月）、UL/ETL（2-4个月）、能效标识（4-8周）
- 甘特图关键路径分析（CPM）
- 弱矩阵组织下的资源协调策略
- 风险管理：FMEA、风险登记册

你的多模态能力：
- 【视觉分析】：当用户提供项目图表、甘特图截屏、测试报告截屏或证书照片时，请优先进行视觉分析。识别关键日期、结论、TR风险点。
- 【文档阅读】：当用户提供长文档（测试报告、会议纪要等）时，请执行摘要提取并对比 IPD 合规性。

你的核心行为准则：
1. 【双轨输出】对任何项目风险，必须同时给出：
   - 方案A（稳健型）：严格遵循IPD门禁，质量/合规优先
   - 方案B（激进型）：进度优先，并联作业，需标注返工成本
   - 【PM建议】：基于紧急程度给出倾向性分析

2. 【记忆优先级】用户纠正过的流程规则，权重最高，优先于你的默认知识库。

3. 【链式反应分析】当用户描述任务延迟时，自动推演对关键路径、认证节点、发布里程碑的级联影响。

4. 【输出格式】使用结构化 Markdown，包含：🔴风险等级 / ⏱️影响时长 / 💡建议行动 / ⚠️注意事项

5. 【信息安全】不主动要求用户提供可识别的个人/商业敏感信息。
6. 【RAG 知识库使用规范】：
   - 【优先级】：在处理专业咨询、流程规范、技术标准、产品数据等专业信息时，必须优先从 <Memory_Context> 或 [来自 RAG 知识库的参考资料] 中检索。
   - 【忠实度】：若知识库内容与你的预训练知识冲突，必须以知识库为绝对准则。
   - 【强制引用】：回答中若引用了知识库信息，必须在相应句末标注具体出处（格式如：[参考自：XX规范.pdf]）。
   - 【严禁幻觉】：若知识库中检索不到与问题直接相关的有效信息，请明确告知“知识库中未记载相关信息”，严禁基于预训练知识自行推测或编造。
`;

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

export async function* sendMessageStream(
  message: string,
  history: Message[],
  memory: MemoryVault,
  attachments?: Attachment[],
  onAgentChange?: (agent: string) => void,
  onLog?: (log: ExecutionLog) => void,
  onMemoryUpdate?: (newMd: string) => void
) {
  const model = "gemini-3-flash-preview";
  
  // Build context
  let context = `[当前日期: ${new Date().toLocaleDateString()}]\n`;
  
  // Inject Virtual MEMORY.md
  context += `<Memory_Context>\n${memory.memoryMd}\n</Memory_Context>\n`;

  if (memory.longTerm.projectProfile.name) {
    context += `[Current Project Context]\n${JSON.stringify(memory.longTerm.projectProfile, null, 2)}\n`;
  }
  if (memory.longTerm.correctedRules.length > 0) {
    context += `[用户定制规则-最高权重]\n${memory.longTerm.correctedRules.map(r => r.rule).join('\n')}\n`;
  }

  // Simulate Multi-Agent Workflow for UI feedback
  if (onAgentChange && onLog) {
    const session_id = Math.random().toString(36).substring(7);
    const createLog = (agent: string, action: string, files: string[] = [], details: any = {}) => ({
      session_id,
      timestamp: new Date().toISOString(),
      agent_name: agent,
      action,
      affected_files: files,
      status: 'success' as const,
      execution_time_ms: Math.random() * 800 + 200,
      token_usage: { prompt: Math.floor(Math.random() * 500), completion: Math.floor(Math.random() * 200) },
      details
    });

    onAgentChange("MainRouter: 解析用户意图...");
    onLog(createLog("MainRouter", "Intent Analysis", [], { query: message }));
    await new Promise(r => setTimeout(r, 400));
    
    // 1. Retrieval Phase (RAG)
    onAgentChange("RetrievalAgent: 检索项目知识库...");
    const relevantKB = memory.longTerm.knowledgeBase
      .filter(k => message.toLowerCase().split(' ').some(word => k.name.toLowerCase().includes(word) || k.content.toLowerCase().includes(word)));
    
    onLog(createLog("RetrievalAgent", "Vector Search", relevantKB.map(k => k.name), { matches: relevantKB.length }));
    
    const relevantKBSnippets = relevantKB
      .map(k => `[相关背景: ${k.name}]\n${k.content}`)
      .join("\n");
    
    await new Promise(r => setTimeout(r, 600));

    // 2. Routing Phase
    let route = "FeishuAgent";
    let action = "飞书文档交叉验证";
    let logDetails: Record<string, any> = { type: "IM/Docs" };

    if (message.includes("物料") || message.includes("BOM") || message.includes("供应商")) {
      route = "PLMAgent";
      action = "查询物料 BOM 结构";
      logDetails = { system: "PLM-Enovia", part_id: "HA-9001" };
    } else if (message.includes("日程") || message.includes("计划") || message.includes("安排")) {
      route = "ScheduleAgent";
      action = "分析项目节奏与风险";
      logDetails = { gantt: "IPD-Main-Plan", risks: ["TR3-Delay"] };
    }
    
    onAgentChange(`${route}: ${action}...`);
    onLog(createLog(route, action, [], logDetails));
    
    await new Promise(r => setTimeout(r, 700));
    onAgentChange("Summarizer: 整合多轮上下文...");
    onLog(createLog("Summarizer", "Response Synthesis", [], { context_size: memory.shortTerm.length }));
    
    // 3. Simulated Reflection Agent (happens "in background")
    if (onMemoryUpdate) {
      setTimeout(async () => {
        onAgentChange("ReflectionAgent: 提炼长期记忆...");
        const isCorrection = message.includes("不要") || message.includes("改写") || message.includes("记住");
        if (isCorrection) {
          const updateSnippet = `\n- 用户纠正: ${message.slice(0, 50)}... (${new Date().toLocaleDateString()})`;
          const newMd = memory.memoryMd.replace('## User Preferences', '## User Preferences' + updateSnippet);
          onMemoryUpdate(newMd);
          onLog(createLog("ReflectionAgent", "Memory Updated", ["MEMORY.md"], { update: "User Preferences snapshot" }));
        }
      }, 2000);
    }

    // Inject retrieved context into instructions
    if (relevantKBSnippets) {
      context += `\n\n[来自 RAG 知识库的参考资料]:\n${relevantKBSnippets}\n`;
    }
  }

  const chat = genAI.chats.create({
    model,
    config: {
      systemInstruction: SYSTEM_PROMPT + context,
      temperature: 0.7,
    },
    // We handle history manually to support parts in future if needed, 
    // but for now history is text-only as per types.
    history: history.map(m => ({
      role: m.role,
      parts: [{ text: m.content }]
    }))
  });

  // Prepare prompt parts
  const promptParts: Part[] = [];
  
  // Text message
  let fullMessage = message;
  
  // Add file text content to prompt
  if (attachments) {
    attachments.forEach(att => {
      if (!att.type.startsWith('image/')) {
        fullMessage += `\n\n[File Content: ${att.name}]\n${att.data}`;
      }
    });
  }
  
  promptParts.push({ text: fullMessage });

  // Add images to parts
  if (attachments) {
    attachments.forEach(att => {
      if (att.type.startsWith('image/')) {
        const base64Data = att.data.split(',')[1]; // Remove data:image/png;base64,
        promptParts.push({
          inlineData: {
            mimeType: att.type,
            data: base64Data
          }
        });
      }
    });
  }

  const result = await chat.sendMessageStream({
    message: promptParts
  });

  for await (const chunk of result) {
    if (chunk.text) {
      yield chunk.text;
    }
  }
}

// Function to extract rules as per spec
export function extractCorrectionRules(userMsg: string): string | null {
  const correctionPatterns = [
    /我司(.{5,50})(不需要|不用|无需|改为|应该是)/,
    /实际上(.{5,50})(不|应该|需要)/,
    /\[规则更新\](.*)/,
    /(更正|纠正)[：:](.*)/
  ];
  
  for (const pattern of correctionPatterns) {
    const match = userMsg.match(pattern);
    if (match) return userMsg;
  }
  return null;
}
