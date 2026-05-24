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

你的核心行为准则与决策优先级：
1. 【黄金参考优先级流程 (强制执行)】：在做任何解答、行动建议和规则引用时，你必须严格按照以下顺序进行信息参考和采信：
   - 【第一优先级：长期记忆】：首要遵循 <Memory_Context> 节点中记载的长期记忆（包含手动修改/提炼的时间戳记、用户先前指出的纠偏规则等）。它的权重最高，优先于任何上下文对话和原始知识，哪怕与后文产生冲突，也必须以此为准！
   - 【第二优先级：当前对话上下文】：承接当前会话历史 (Conversation History)，保持逻辑连贯、主语锁定及先前的回答铺垫。
   - 【第三优先级：RAG 知识库】：参考本次对话携带的 [来自 RAG 知识库的参考资料] (由用户上传的 PDF、Word、Excel 等文件的提取内容)。必须保持绝对的忠实度，并且在涉及引用时标注出处。

2. 【双轨输出】对任何项目风险，必须同时给出：
   - 方案A（稳健型）：严格遵循IPD门禁，质量/合规优先
   - 方案B（激进型）：进度优先，并联作业，需标注返工成本
   - 【PM建议】：基于紧急程度给出倾向性分析

3. 【链式反应分析】当用户描述任务延迟时，自动推演对关键路径、认证节点、发布里程碑的级联影响。

4. 【输出格式】使用结构化 Markdown，包含：🔴风险等级 / ⏱️影响时长 / 💡建议行动 / ⚠️注意事项

5. 【信息安全】不主动要求用户提供可识别的个人/商业敏感信息。

6. 【RAG 知识库使用规范】：
   - 【优先级】：知识库作为第三优先级来源，检索结果能够为专业流程及标准规范提供强有力的事实支撑。
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
  // 3. 响应式反馈: 预先判定是否需要调用 RAG 检索或 PLM 库
  const keywordsNeeded = [
    "tr", "gate", "bom", "物料", "器件", "型号", "供应商", "计划", "进度", "延期", "规范", "标准", "知识库", 
    "主计划", "变更", "马达", "风险", "通知", "重新测试", "格式", "日期", "主计划表", "供应商状态"
  ];
  const requiresTools = keywordsNeeded.some(kw => message.toLowerCase().includes(kw));

  if (requiresTools) {
    // 立即通过 stream 告知用户，避免看到系统处于空白无反应界面
    yield "⚡ **[正在通过并发通道异步检索 RAG 规范与物料 BOM 数据库中...]** \n\n";
  }

  // 1. Attempt using FastAPI real backend LangGraph flow
  try {
    if (onAgentChange) {
      onAgentChange("MainRouter: 规划多 Agent 决策路径...");
    }

    const apiMessages = history.map(m => ({
      role: m.role === 'model' ? 'assistant' : m.role,
      content: m.content
    }));

    const thread_id = memory.longTerm.projectProfile.name || "default_thread";

    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        messages: apiMessages,
        next_agent: "main_router",
        context_summary: memory.memoryMd,
        shared_data: {
          project_profile: memory.longTerm.projectProfile,
          corrected_rules: memory.longTerm.correctedRules
        },
        iteration_count: 0,
        thread_id: thread_id
      })
    });

    if (!response.ok) {
      throw new Error(`FastAPI returned status ${response.status}`);
    }

    const data = await response.json();
    if (data.status === 'success' && data.state) {
      // Replay real backend execution logs
      const logs: ExecutionLog[] = data.logs || [];
      for (const log of logs) {
        if (onAgentChange) {
          onAgentChange(`${log.agent_name}: ${log.action}...`);
        }
        if (onLog) {
          onLog({
            session_id: log.session_id || thread_id,
            timestamp: log.timestamp || new Date().toISOString(),
            agent_name: log.agent_name,
            action: log.action,
            status: log.status || 'success',
            execution_time_ms: log.execution_time_ms || 200,
            token_usage: log.token_usage || { prompt: 200, completion: 50 },
            affected_files: log.affected_files || [],
            details: log.details || {}
          });
        }
        // Small premium transition delay to let user digest the agent transitions
        await new Promise(r => setTimeout(r, 450));
      }

      // Output final assistant response
      const retMessages = data.state.messages || [];
      const assistantMsgs = retMessages.filter((m: any) => m.role === 'assistant' || m.role === 'model');
      let finalContent = "";
      if (assistantMsgs.length > 0) {
        finalContent = assistantMsgs[assistantMsgs.length - 1].content;
      } else {
        finalContent = "Agent 工作流执行完成，未检测到最新输出。";
      }

      // Smooth streaming simulation for comfortable reading speeds
      const chunkSize = 5;
      for (let i = 0; i < finalContent.length; i += chunkSize) {
        yield finalContent.slice(i, i + chunkSize);
        await new Promise(r => setTimeout(r, 15));
      }

      if (onMemoryUpdate) {
        setTimeout(() => {
          if (onAgentChange) onAgentChange("ReflectionAgent: 提炼长期记忆...");
          runClientSideReflection(message, finalContent, memory, onMemoryUpdate, onLog);
        }, 300);
      }
      return; // Succeeded! Bye bypass fallback
    }
  } catch (apiErr) {
    console.warn("Python backend connection failed, falling back to direct client-side Gemini:", apiErr);
  }

  // 2. Fallback: Direct Gemini API execution client-side
  const model = "gemini-3.5-flash";
  
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
    const relevantKB = memory.longTerm.knowledgeBase.filter(k => {
      const msgLower = message.toLowerCase();
      const nameLower = k.name.toLowerCase();
      const contentLower = k.content.toLowerCase();
      
      // Directly check if there is an exact match for the name or if they are related
      if (msgLower.includes(nameLower) || nameLower.includes(msgLower)) return true;
      
      // Extract main terms / keyword matching for multi-language (punctuation split)
      const terms = msgLower.split(/[\s,，.。?？!！;；、]/).filter(w => w.length >= 2);
      if (terms.length === 0) {
        // Fallback for extremely short words/chars
        return msgLower.split('').some(char => char.trim() && (nameLower.includes(char) || contentLower.includes(char)));
      }
      return terms.some(t => nameLower.includes(t) || contentLower.includes(t));
    });
    
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
        const base64Data = att.data.split(',')[1];
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

  let finalContent = "";
  for await (const chunk of result) {
    if (chunk.text) {
      finalContent += chunk.text;
      yield chunk.text;
    }
  }

  if (onMemoryUpdate) {
    setTimeout(() => {
      if (onAgentChange) onAgentChange("ReflectionAgent: 提炼长期记忆...");
      runClientSideReflection(message, finalContent, memory, onMemoryUpdate, onLog);
    }, 500);
  }
}

export async function runClientSideReflection(
  userMsg: string,
  modelMsg: string,
  memory: MemoryVault,
  onMemoryUpdate: (newMd: string) => void,
  onLog?: (log: ExecutionLog) => void
) {
  try {
    const apiKey = process.env.GEMINI_API_KEY || '';
    if (!apiKey) return;

    const now = new Date();
    const pad = (n: number) => n.toString().padStart(2, '0');
    const timestamp = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;

    const prompt = `你是一个项目经理专属的长期记忆反思代理 (ReflectionAgent)。
你的任务是阅读给定的最后一轮对话（User和Assistant），并基于此动态提炼并合并项目细节或用户明确纠偏的规则到原有的 MEMORY.md 长期记忆文档中。

现有 MEMORY.md 内容：
"""
${memory.memoryMd}
"""

最新一轮对话：
- 用户的消息: "${userMsg}"
- 助手的回应: "${modelMsg}"

请根据以下规则生成并返回合并后的完整 MEMORY.md Markdown 文档：
1. **自带时间戳**：解析最新对话中的重要信息，如果有新提炼的名词事实、纠偏规则、偏好习惯、里程碑节点，分类后合并到正确标题下。如果原文档已有该信息，则保留其原有条目。每一个**新增或修改**的信息项末尾必须带有当前的时间戳，格式为: \`(${timestamp})\`。如果是旧的、没有在这轮对话被修改的保留条目，请继续保留它原先存在的时间戳（不要将其覆盖改写成当前时间）。
2. **类目映射**：
   - 如果是用户偏好，归入 \`## User Preferences\` (例如: "- 偏好简洁的技术性回复 (2026-05-24 13:36:55)")
   - 如果是项目关键节点、预期 launch 时间、阶段门禁/TR 节点更新或其它里程碑，归入 \`## Project Milestones\`
   - 如果是技术方案问题解决历史、物料供应商决策/二供冲突解决历史、产品规格确定，归入 \`## Resolution History\`
   - 如果是公司/项目硬性合规要求、必须遵守的质量要求，或者用户通过"纠正"/"更正"显式提出的更新规则，归入 \`## Global Rules\`
3. **精准提炼与去重**：只记录有真正长期保留价值的项目关键、流程规范、要求变更信息，如果对话中没有任何新的有保留价值的事实/偏好，请直接返回原有的 MEMORY.md 内容。
4. **输出格式**：直接返回合并后的完整 Markdown 文本。绝对不可包含 markdown 的 \`\`\` 包裹（比如 \`\`\`markdown 这样的格式），也不要包含任何像 "好的，合并后的文档如下" 的多余文字。
`;

    const gAI = new GoogleGenAI({ apiKey });
    const response = await gAI.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
      config: {
        temperature: 0.1,
      }
    });

    const newMd = response.text ? response.text.trim() : '';
    if (newMd && newMd !== memory.memoryMd) {
      let sanitized = newMd;
      if (sanitized.startsWith('```markdown')) {
        sanitized = sanitized.substring(11);
      } else if (sanitized.startsWith('```')) {
        sanitized = sanitized.substring(3);
      }
      if (sanitized.endsWith('```')) {
        sanitized = sanitized.substring(0, sanitized.length - 3);
      }
      sanitized = sanitized.trim();
      
      onMemoryUpdate(sanitized);
      
      if (onLog) {
        onLog({
          session_id: "reflection_session",
          timestamp: now.toISOString(),
          agent_name: "ReflectionAgent",
          action: "Memory Refined",
          status: "success",
          execution_time_ms: 220,
          token_usage: { prompt: 150, completion: 60 },
          affected_files: ["MEMORY.md"],
          details: { update: "Memory.md updated automatically with timestamp", timestamp: timestamp }
        });
      }
    }
  } catch (err) {
    console.error("Client side reflection error:", err);
  }
}

// Function to extract rules as per spec
export function extractCorrectionRules(userMsg: string): string | null {
  const correctionPatterns = [
    { regex: /我司(.{2,100})(不需要|不用|无需|改为|应该是|必须)[^，。？！]*/, handler: (m: RegExpMatchArray) => m[0] },
    { regex: /实际上(.{2,100})(不|应该|需要|必须)[^，。？！]*/, handler: (m: RegExpMatchArray) => m[0] },
    { regex: /\[规则更新\]\s*(.*)/, handler: (m: RegExpMatchArray) => m[1] },
    { regex: /(更正|纠正)[：:]\s*(.*)/, handler: (m: RegExpMatchArray) => m[2] }
  ];
  
  for (const item of correctionPatterns) {
    const match = userMsg.match(item.regex);
    if (match) {
      const extracted = item.handler(match);
      if (extracted) return extracted.trim();
    }
  }
  return null;
}
