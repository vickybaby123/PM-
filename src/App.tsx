import React, { useState, useEffect, useCallback } from 'react';
import Sidebar from './components/Sidebar';
import ChatArea from './components/ChatArea';
import SettingsModal from './components/SettingsModal';
import VoiceCallOverlay from './components/VoiceCallOverlay';
import SettingsContent from './components/settings/SettingsContent';
import { MemoryVault, Message, ProjectProfile, IPDStage, Attachment } from './types';
import { sendMessageStream, extractCorrectionRules } from './services/gemini';

const INITIAL_MEMORY: MemoryVault = {
  shortTerm: [],
  memoryMd: `## User Preferences
- 偏好简洁的技术性回复
- 关注 IPD 流程合规性

## Project Milestones
- TR1: 已完成
- TR2: 进行中 (预期 05/15)

## Resolution History
- 解决了关于 HA-9001 的物料二供冲突

## Global Rules
- 对于所有 TR3 节点必查噪声测试报告
`,
  longTerm: {
    projectProfile: {
      name: '',
      stage: 'concepts',
      targetLaunch: '',
      certRequired: [],
      stakeholders: '',
      autoRead: false
    },
    correctedRules: [],
    decisionHistory: [],
    riskPatterns: [],
    persona: {
      name: 'PM-CoPilot',
      avatar: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=200',
      description: '家电行业 IPD 项目经理助理，精通双核决策、链式风险分析、生成项目早报',
      responsibilities: `## 角色定义
你是 PM-CoPilot，一位拥有10年家电行业经验的 IPD 专家级项目经理助手。你的代号是“数字副驾驶”，专为弱矩阵组织中的 PM 而生。

## 核心知识体系
你精通以下领域：
- **IPD 全流程**: 概念 -> 计划 -> 开发 -> 验证 -> 发布 -> 生命周期管理，熟悉各阶段 Gate/TR 门槛要求
- **家电认证周期**: CCC(3-6个月)、CE(1-3个月)、UL/ETL(2-4个月)、能效标识(4-8周)、ROHS(2-4周)
- **关键路径法(CPM)**: 与甘特图分析
- **风险管理**: FMEA 方法论、风险登记册维护`,
      constraints: `## 行为准则
- **专业严谨**: 所有回复需符合 IPD 术语规范，避免空洞的建议。
- **冲突规避**: 在资源协调建议中，优先考虑跨部门沟通而非行政压制。
- **数据敏感**: 识别并保护 PLM 单号、内部成本等敏感信息。`
    },
    tools: [
      { id: 'search', name: '联网搜索', description: '从公开互联网检索实时信息，获取最新的行业资讯、公开数据与外部知识', enabled: true },
      { id: 'qa', name: '知识问答', description: '基于飞书内容内的云文档、多维表格、聊天记录等企业数据，智能总结并回答问题', enabled: true },
      { id: 'kb', name: '知识检索', description: '在知识空间中精确检索，支持添加个人私密和企业公开知识空间的知识资产', enabled: true },
    ],
    mcp: [
      { id: 'feishu-card', name: '飞书消息卡片', description: '根据用户的需求生成对应的飞书消息卡片，并支持后续的修改和完善', icon: '', isOfficial: true },
      { id: 'feishu-cs', name: '飞书智能客服', description: '飞书知识库构建的问答服务，可以解答飞书用户对于“飞书产品使用”、“客户案例和解决方案”以及“飞书购买咨询”的相关疑问', icon: '', isOfficial: true },
    ],
    skills: [
      { id: 'img-gen', name: '豆包图片生成', description: 'aily-image-generate | 飞书 | AI图片生成最佳实践指南', icon: '', isOfficial: true },
      { id: 'stt', name: '豆包语音识别', description: 'aily-speech-to-text | 飞书 | 高性能语音识别与字幕生成技能', icon: '', isOfficial: true },
    ],
    knowledgeBase: [
      { id: 'kb-default', name: 'IPD 流程规范', content: '这里存储了关于 IPD 流程的各种规范和要求...', type: 'doc', updatedAt: Date.now() }
    ],
    agents: [
      { id: 'agent-feishu', name: 'FeishuAgent', role: '文档与消息助手', prompt: '你负责处理文档检索和 IM 消息。', enabled: true },
      { id: 'agent-plm', name: 'PLMAgent', role: '产品生命周期助手', prompt: '你负责物料、二供、变更等硬数据查询。', enabled: true },
      { id: 'agent-schedule', name: 'ScheduleAgent', role: '进度分析助手', prompt: '负责项目阶段计划与时间同步。', enabled: true },
      { id: 'agent-retrieval', name: 'RetrievalAgent', role: '检索与提炼助手', prompt: '专门用来检索和提炼 RAG 知识库的信息。', enabled: true },
    ],
    logs: [
      {
        session_id: 'default',
        timestamp: new Date().toISOString(),
        agent_name: 'System',
        action: 'Init',
        status: 'success',
        execution_time_ms: 0,
        token_usage: { prompt: 0, completion: 0 },
        affected_files: [],
        details: { message: 'PM-Copilot Debug Console Ready.' }
      }
    ]
  },
};

import { Settings as SettingsIcon } from 'lucide-react';

import { VoiceModule } from './lib/voice';

export default function App() {
  const [memory, setMemory] = useState<MemoryVault>(() => {
    const saved = localStorage.getItem('pm_copilot_memory');
    if (!saved) return INITIAL_MEMORY;
    
    try {
      const parsed = JSON.parse(saved);
      // Deep merge basic logic to ensure new fields in INITIAL_MEMORY are present
      return {
        ...INITIAL_MEMORY,
        ...parsed,
        memoryMd: parsed.memoryMd || INITIAL_MEMORY.memoryMd,
        longTerm: {
          ...INITIAL_MEMORY.longTerm,
          ...(parsed.longTerm || {}),
          projectProfile: {
            ...INITIAL_MEMORY.longTerm.projectProfile,
            ...(parsed.longTerm?.projectProfile || {})
          },
          knowledgeBase: parsed.longTerm?.knowledgeBase || INITIAL_MEMORY.longTerm.knowledgeBase,
          agents: parsed.longTerm?.agents || INITIAL_MEMORY.longTerm.agents,
          logs: parsed.longTerm?.logs || INITIAL_MEMORY.longTerm.logs
        }
      };
    } catch (e) {
      console.error("Failed to load memory:", e);
      return INITIAL_MEMORY;
    }
  });

  const [inputValue, setInputValue] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isCallModeOpen, setIsCallModeOpen] = useState(false);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [view, setView] = useState<'chat' | 'settings'>('chat');
  const [activeSettingId, setActiveSettingId] = useState('persona');
  const [activeAgent, setActiveAgent] = useState<string | null>(null);
  const [calledAgents, setCalledAgents] = useState<Set<string>>(new Set());

  useEffect(() => {
    localStorage.setItem('pm_copilot_memory', JSON.stringify(memory));
  }, [memory]);

  const handleNewExternalMessage = useCallback((msg: Message) => {
    setMemory(prev => ({
      ...prev,
      shortTerm: [...prev.shortTerm, msg].slice(-20)
    }));
  }, []);

  const handleSendMessage = useCallback(async (msgOverride?: string) => {
    const content = (msgOverride || inputValue).trim();
    if (!content && attachments.length === 0) return;

    // Check for correction rules
    const newRule = extractCorrectionRules(content);
    if (newRule) {
      setMemory(prev => ({
        ...prev,
        longTerm: {
          ...prev.longTerm,
          correctedRules: [
            ...prev.longTerm.correctedRules,
            { rule: content, timestamp: Date.now(), weight: 'HIGHEST', source: 'user_correction' }
          ]
        }
      }));
    }

    const userMessage: Message = {
      role: 'user',
      content: content || (attachments.length > 0 ? "[发送了附件]" : ""),
      timestamp: Date.now(),
    };

    const newMessages = [...memory.shortTerm, userMessage];
    setMemory(prev => ({
      ...prev,
      shortTerm: newMessages.slice(-20) // Keep last 20
    }));
    
    const currentAttachments = [...attachments];
    setInputValue('');
    setAttachments([]);
    setIsStreaming(true);
    setActiveAgent(null);
    setCalledAgents(new Set());

    try {
      const stream = sendMessageStream(
        content, 
        memory.shortTerm, 
        memory, 
        currentAttachments, 
        (agent) => setActiveAgent(agent),
        (log) => {
          setCalledAgents(prev => new Set(prev).add(log.agent_name));
          setMemory(prev => ({
            ...prev,
            longTerm: {
              ...prev.longTerm,
              logs: [...(prev.longTerm.logs || []), log]
            }
          }));
        },
        (newMd) => setMemory(prev => ({
          ...prev,
          memoryMd: newMd
        }))
      );
      let assistantResponse = '';
      
      // Temporary message for streaming
      const assistantMessage: Message = {
        role: 'model',
        content: '',
        timestamp: Date.now(),
      };

      for await (const chunk of stream) {
        assistantResponse += chunk;
        setMemory(prev => {
          const updated = [...prev.shortTerm];
          if (updated[updated.length - 1]?.role === 'model') {
            updated[updated.length - 1] = { ...updated[updated.length - 1], content: assistantResponse };
          } else {
            updated.push({ ...assistantMessage, content: assistantResponse });
          }
          return { ...prev, shortTerm: updated };
        });
      }

      // TTS auto read if enabled
      if (memory.longTerm.projectProfile.autoRead) {
        VoiceModule.speak(assistantResponse);
      }
    } catch (error) {
      console.error('Gemini Error:', error);
      setMemory(prev => ({
        ...prev,
        shortTerm: [
          ...prev.shortTerm,
          { role: 'model', content: `❌ **发生错误**: ${error instanceof Error ? error.message : '未知错误'}. 请检查网络或 API Key 设置。`, timestamp: Date.now() }
        ]
      }));
    } finally {
      setIsStreaming(false);
    }
  }, [inputValue, attachments, memory]);

  const handleQuickCommand = (cmd: string) => {
    setInputValue(cmd);
    // Autofill commonly used commands if they have placeholders
    if (!cmd.includes('[') && !cmd.includes(']')) {
      handleSendMessage(cmd);
    }
  };

  const handleExport = (content: string) => {
    // Sanitization as per spec
    const sanitized = content
      .replace(/PLM-\d+/g, '[单号已脱敏]')
      .replace(/\b1[3-9]\d{9}\b/g, '[电话已脱敏]');

    const feishuFormat = `**[PM-CoPilot 自动生成 | ${new Date().toLocaleString()}]**\n\n${sanitized}\n\n---\n*本分析由 PM-CoPilot 辅助生成，仅供参考，最终决策以 PM 判断为准*`;
    
    navigator.clipboard.writeText(feishuFormat);
    alert('已复制飞书格式到剪贴板！');
  };

  const clearSession = () => {
    if (confirm('确定要清除当前对话历史吗？（保留项目画像和规则库）')) {
      setMemory(prev => ({ ...prev, shortTerm: [] }));
      setCalledAgents(new Set());
    }
  };

  return (
    <div className="flex h-screen w-full bg-[#0d1b2a] text-slate-200 font-sans overflow-hidden">
      <Sidebar 
        memory={memory} 
        onOpenSettings={() => setIsSettingsOpen(true)}
        onQuickCommand={handleQuickCommand}
        activeSettingId={activeSettingId}
        onSelectSetting={(id) => {
          setActiveSettingId(id);
          setView('settings');
        }}
        onSwitchToChat={() => setView('chat')}
        currentView={view}
      />
      
      <main className="flex-1 flex flex-col h-full bg-[#0d1b2a] relative">
        {/* Top Header */}
        <header className="h-16 flex items-center justify-between px-6 bg-[#1a2942] border-b border-white/10 shrink-0">
          <div className="flex items-center gap-3 cursor-pointer" onClick={() => setView('chat')}>
            <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center font-bold text-white shadow-lg shadow-blue-500/20">P</div>
            <h1 className="text-lg font-semibold tracking-tight text-white focus:outline-none">
              PM-CoPilot <span className="text-blue-400 font-normal">1.0</span>
            </h1>
          </div>
          <div className="flex items-center gap-6">
            <div 
              onClick={() => setIsSettingsOpen(true)}
              className="flex flex-col items-end cursor-pointer group hover:opacity-80 transition-all"
            >
              <span className="text-[10px] text-slate-500 uppercase tracking-[0.2em] font-bold group-hover:text-blue-400">Active Project</span>
              <span className="text-sm font-medium text-blue-100 italic group-hover:text-white">
                {memory.longTerm.projectProfile.name || '未命名项目'}
              </span>
            </div>
            <button 
              onClick={() => setIsSettingsOpen(true)}
              className="p-2 hover:bg-white/5 rounded-full transition-colors"
            >
              <SettingsIcon className="w-5 h-5 text-slate-400" />
            </button>
          </div>
        </header>

        {view === 'chat' ? (
          <ChatArea 
            messages={memory.shortTerm}
            inputValue={inputValue}
            isStreaming={isStreaming}
            activeAgent={activeAgent}
            agents={memory.longTerm.agents}
            calledAgents={calledAgents}
            onInputChange={setInputValue}
            onSendMessage={() => handleSendMessage()}
            onExport={handleExport}
            onClear={clearSession}
            onQuickCommand={handleQuickCommand}
            attachments={attachments}
            onSetAttachments={setAttachments}
            onToggleCallMode={() => setIsCallModeOpen(true)}
          />
        ) : (
          <div className="flex-1 overflow-y-auto bg-white dark:bg-[#0d1b2a]">
            <SettingsContent 
              activeId={activeSettingId} 
              memory={memory} 
              onUpdateMemory={setMemory}
              activeAgent={activeAgent}
            />
          </div>
        )}
      </main>

      <SettingsModal 
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        profile={memory.longTerm.projectProfile}
        onSave={(newProfile) => setMemory(prev => ({
          ...prev,
          longTerm: { ...prev.longTerm, projectProfile: newProfile }
        }))}
      />

      <VoiceCallOverlay 
        isOpen={isCallModeOpen}
        onClose={() => setIsCallModeOpen(false)}
        memory={memory}
        onNewMessage={handleNewExternalMessage}
      />
    </div>
  );
}
