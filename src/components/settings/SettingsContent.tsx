import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Edit2, MessageSquare, Plus, Search, Check, X, Shield, Wrench, Cpu, Puzzle, Trash2, ExternalLink, BarChart3, History, Database, Bot, Save, FileText, Upload, Brain } from 'lucide-react';
import { MemoryVault, Persona, SettingsTool, MCPItem, SkillItem, KnowledgeBaseItem, AgentConfig, ExecutionLog } from '../../types';
import { cn } from '../../lib/utils';
import ReactMarkdown from 'react-markdown';
import { DebugLogPanel } from '../DebugLogPanel';
import * as mammoth from 'mammoth';
import * as pdfjs from 'pdfjs-dist';
import * as XLSX from 'xlsx';

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

interface SettingsContentProps {
  activeId: string;
  memory: MemoryVault;
  onUpdateMemory: (updater: (prev: MemoryVault) => MemoryVault) => void;
  activeAgent: string | null;
}

export default function SettingsContent({ activeId, memory, onUpdateMemory, activeAgent }: SettingsContentProps) {
  const content = (() => {
    switch (activeId) {
      case 'persona':
        return <PersonaView persona={memory.longTerm.persona} onUpdate={(p) => onUpdateMemory(prev => ({ 
          ...prev, longTerm: { ...prev.longTerm, persona: p } 
        }))} />;
      case 'memory':
        return <MemoryMdView memoryMd={memory.memoryMd} onUpdate={(m) => onUpdateMemory(prev => ({ 
          ...prev, memoryMd: m 
        }))} />;
      case 'memory-analytics':
        return <MemoryAnalyticsView memory={memory} onUpdateMemory={onUpdateMemory} />;
      case 'tools':
        return <ToolsView tools={memory.longTerm.tools} onUpdate={(t) => onUpdateMemory(prev => ({ 
          ...prev, longTerm: { ...prev.longTerm, tools: t } 
        }))} />;
      case 'mcp':
        return <MCPView items={memory.longTerm.mcp} onUpdate={(m) => onUpdateMemory(prev => ({ 
          ...prev, longTerm: { ...prev.longTerm, mcp: m } 
        }))} />;
      case 'skills':
        return <SkillsView items={memory.longTerm.skills} onUpdate={(s) => onUpdateMemory(prev => ({ 
          ...prev, longTerm: { ...prev.longTerm, skills: s } 
        }))} />;
      case 'rag':
        return <KnowledgeBaseView items={memory.longTerm.knowledgeBase} onUpdate={(k) => onUpdateMemory(prev => ({ 
          ...prev, longTerm: { ...prev.longTerm, knowledgeBase: k } 
        }))} />;
      case 'agents':
        return <AgentsView agents={memory.longTerm.agents} onUpdate={(a) => onUpdateMemory(prev => ({ 
          ...prev, longTerm: { ...prev.longTerm, agents: a } 
        }))} />;
      case 'logs':
        return <DebugLogPanel logs={memory.longTerm.logs || []} activeAgent={activeAgent} onExport={() => {}} />;
      default:
        return <div className="p-12 text-slate-500 italic">正在开发中...</div>;
    }
  })();

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={activeId}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        transition={{ duration: 0.2 }}
        className="h-full"
      >
        {content}
      </motion.div>
    </AnimatePresence>
  );
}

// --- Memory Analytics View ---
function MemoryAnalyticsView({ memory, onUpdateMemory }: { memory: MemoryVault, onUpdateMemory: any }) {
  const [activeTab, setActiveTab] = useState<'rules' | 'history' | 'risks'>('rules');

  const removeRule = (id: number) => {
    onUpdateMemory((prev: MemoryVault) => ({
      ...prev,
      longTerm: {
        ...prev.longTerm,
        correctedRules: prev.longTerm.correctedRules.filter((_, idx) => idx !== id)
      }
    }));
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 p-8 pb-32">
      <div className="space-y-1">
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">持续记忆库</h2>
        <p className="text-sm text-slate-500">管理智能体的长期记忆，包括用户纠偏规则、决策历史和识别到的风险模式</p>
      </div>

      <div className="flex items-center gap-6 border-b border-slate-200 dark:border-white/10">
        {[
          { id: 'rules', label: '纠偏规则', count: memory.longTerm.correctedRules.length },
          { id: 'history', label: '决策历史', count: memory.longTerm.decisionHistory.length },
          { id: 'risks', label: '风险模式', count: memory.longTerm.riskPatterns.length },
        ].map(tab => (
          <button 
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={cn(
              "pb-3 text-sm font-medium transition-all relative flex items-center gap-2",
              activeTab === tab.id ? "text-blue-500" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            )}
          >
            {tab.label}
            <span className="text-[10px] bg-slate-100 dark:bg-white/10 px-1.5 py-0.5 rounded-full">{tab.count}</span>
            {activeTab === tab.id && <motion.div layoutId="mem-tab" className="absolute bottom-0 inset-x-0 h-0.5 bg-blue-500" />}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {activeTab === 'rules' && (
          <>
            {memory.longTerm.correctedRules.length > 0 ? (
              memory.longTerm.correctedRules.map((rule, i) => (
                <div key={i} className="p-4 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl flex items-start justify-between group hover:border-blue-500/30 transition-all">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-blue-500 uppercase tracking-tighter">Correction Rule</span>
                      <span className="text-[10px] text-slate-400">{new Date(rule.timestamp).toLocaleString()}</span>
                    </div>
                    <p className="text-sm text-slate-700 dark:text-slate-300 font-mono leading-relaxed bg-white/50 dark:bg-black/20 p-2 rounded border border-black/5 dark:border-white/5">{rule.rule}</p>
                  </div>
                  <button 
                    onClick={() => removeRule(i)}
                    className="p-2 opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 transition-all hover:bg-red-500/10 rounded-lg"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))
            ) : (
              <div className="text-center py-20 bg-slate-50 dark:bg-white/5 rounded-3xl border-2 border-dashed border-slate-200 dark:border-white/5">
                <BrainCircuit className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                <p className="text-slate-400 italic text-sm">尚未学习到任何纠偏规则，智能体会通过对话自动进化</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// --- Persona View ---
function PersonaView({ persona, onUpdate }: { persona: Persona, onUpdate: (p: Persona) => void }) {
  const [activeTab, setActiveTab] = useState<'work' | 'behavior'>('work');
  const [isEditing, setIsEditing] = useState(false);
  const [tempPersona, setTempPersona] = useState(persona);
  const [isEditingContent, setIsEditingContent] = useState(false);
  const [editContent, setEditContent] = useState('');

  const startEditing = () => {
    setEditContent(activeTab === 'work' ? persona.responsibilities : persona.constraints);
    setIsEditingContent(true);
  };

  const saveEditing = () => {
    if (activeTab === 'work') {
      onUpdate({ ...persona, responsibilities: editContent });
    } else {
      onUpdate({ ...persona, constraints: editContent });
    }
    setIsEditingContent(false);
  };

  const cancelEditing = () => {
    setIsEditingContent(false);
  };

  const handleTabChange = (tab: 'work' | 'behavior') => {
    setActiveTab(tab);
    setIsEditingContent(false);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 p-8 pb-32">
      <div className="space-y-1">
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">人设</h2>
        <p className="text-sm text-slate-500">数字员工智能体的出厂设置，定义三件事：我是谁，做什么（岗位职责），怎么做（行为素养）</p>
      </div>

      <div className="bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-6 flex items-start gap-4">
        <div className="relative group shrink-0">
          <img src={persona.avatar} alt="Avatar" className="w-16 h-16 rounded-full object-cover border-2 border-white dark:border-slate-800 shadow-sm" />
          <button className="absolute inset-0 bg-black/40 rounded-full opacity-0 group-hover:opacity-100 flex items-center justify-center text-white transition-opacity">
            <Edit2 className="w-4 h-4" />
          </button>
        </div>
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2">
            {isEditing ? (
              <div className="flex items-center gap-2">
                <input 
                  className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/10 rounded px-2 py-0.5 text-lg font-bold outline-none ring-2 ring-blue-500/20"
                  value={tempPersona.name}
                  onChange={e => setTempPersona({...tempPersona, name: e.target.value})}
                  autoFocus
                />
                <button onClick={() => { onUpdate(tempPersona); setIsEditing(false); }} className="p-1 text-emerald-500 hover:bg-emerald-500/10 rounded"><Check className="w-4 h-4"/></button>
                <button onClick={() => { setTempPersona(persona); setIsEditing(false); }} className="p-1 text-red-500 hover:bg-red-500/10 rounded"><X className="w-4 h-4"/></button>
              </div>
            ) : (
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">{persona.name}</h3>
            )}
            {!isEditing && <Edit2 className="w-3.5 h-3.5 text-slate-400 cursor-pointer hover:text-blue-500" onClick={() => setIsEditing(true)} />}
          </div>
          <p className="text-sm text-slate-500">{persona.description}</p>
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center gap-6 border-b border-slate-200 dark:border-white/10">
          <button 
            onClick={() => handleTabChange('work')}
            className={cn(
              "pb-3 text-sm font-medium transition-all relative",
              activeTab === 'work' ? "text-blue-500" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            )}
          >
            工作职责
            {activeTab === 'work' && <motion.div layoutId="tab" className="absolute bottom-0 inset-x-0 h-0.5 bg-blue-500" />}
          </button>
          <button 
            onClick={() => handleTabChange('behavior')}
            className={cn(
              "pb-3 text-sm font-medium transition-all relative",
              activeTab === 'behavior' ? "text-blue-500" : "text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
            )}
          >
            行为约束
            {activeTab === 'behavior' && <motion.div layoutId="tab" className="absolute bottom-0 inset-x-0 h-0.5 bg-blue-500" />}
          </button>
        </div>

        <div className="relative bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl min-h-[400px] group">
          <div className="absolute top-4 right-4 z-10 flex gap-2">
            {isEditingContent ? (
              <>
                <button 
                  onClick={saveEditing}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-medium hover:shadow-md transition-all shadow-lg shadow-green-600/10"
                >
                  <Check className="w-3 h-3" /> 保存
                </button>
                <button 
                  onClick={cancelEditing}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-medium hover:shadow-md transition-all"
                >
                  <X className="w-3 h-3" /> 取消
                </button>
              </>
            ) : (
              <>
                <button 
                  onClick={startEditing}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-200 hover:shadow-md transition-all"
                >
                  <Edit2 className="w-3 h-3" /> 编辑
                </button>
                <button 
                  onClick={() => alert('可以通过在左侧的对话框中直接下达人设调整或职责修正指令，AI 协同助理将自动为您分析并重塑。')}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-white/10 rounded-lg text-xs font-medium text-slate-700 dark:text-slate-200 hover:shadow-md transition-all"
                >
                  <MessageSquare className="w-3 h-3" /> 对话修改
                </button>
              </>
            )}
          </div>

          <div className="p-8 prose dark:prose-invert prose-sm max-w-none text-slate-800 dark:text-slate-100 markdown-body">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-6 border-l-2 border-blue-500 pl-3">
              {activeTab === 'work' ? 'WHAT · 定义智能体的职责边界和工作范围' : 'HOW · 定义智能体的沟通习惯和行为边界'}
            </div>
            {isEditingContent ? (
              <textarea
                value={editContent}
                onChange={e => setEditContent(e.target.value)}
                className="w-full min-h-[350px] bg-white dark:bg-slate-900/40 border border-slate-200 dark:border-white/10 rounded-xl p-4 text-sm font-sans text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-blue-500/20 transition-all resize-y"
                placeholder={activeTab === 'work' ? "请输入工作职责内容..." : "请输入设计或行为约束..."}
                autoFocus
              />
            ) : (
              <ReactMarkdown>
                {activeTab === 'work' ? persona.responsibilities : persona.constraints}
              </ReactMarkdown>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Tools View ---
function ToolsView({ tools, onUpdate }: { tools: SettingsTool[], onUpdate: (t: SettingsTool[]) => void }) {
  const toggleTool = (id: string) => {
    onUpdate(tools.map(t => t.id === id ? { ...t, enabled: !t.enabled } : t));
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 p-8 pb-32">
      <div className="space-y-1">
        <h2 className="text-xl font-bold text-slate-900 dark:text-white">内置工具</h2>
        <p className="text-sm text-slate-500">为智能体配置可用工具，灵活适配不同业务场景需求（默认为飞书系列工具）</p>
      </div>

      <div className="space-y-8">
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            知识搜索与问答
            <span className="text-[10px] text-blue-500 border border-blue-500/30 rounded px-1.5 py-0.5">● 调用 AI 额度</span>
          </h3>
          <p className="text-xs text-slate-500">连接互联网、飞书企业数据及知识空间，为智能体提供全面、实时的知识检索与智能问答能力</p>
          
          <div className="space-y-3">
            {tools.map(tool => (
              <div key={tool.id} className="flex items-center justify-between p-4 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl hover:border-blue-500/30 transition-all group">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-white dark:bg-slate-800 flex items-center justify-center border border-slate-200 dark:border-white/10 shadow-sm text-slate-400 group-hover:text-blue-500 transition-colors">
                    {tool.id === 'search' ? <Search className="w-5 h-5" /> : tool.id === 'qa' ? <MessageSquare className="w-5 h-5" /> : <Shield className="w-5 h-5" />}
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">{tool.name}</h4>
                    <p className="text-xs text-slate-500">{tool.description}</p>
                  </div>
                </div>
                <button 
                  onClick={() => toggleTool(tool.id)}
                  className={cn(
                    "w-11 h-6 rounded-full transition-all relative overflow-hidden",
                    tool.enabled ? "bg-blue-600 shadow-[0_0_12px_rgba(37,99,235,0.4)]" : "bg-slate-300 dark:bg-slate-700"
                  )}
                >
                  <motion.div 
                    animate={{ x: tool.enabled ? 22 : 4 }}
                    className="absolute top-1 w-4 h-4 bg-white rounded-full shadow-sm"
                  />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// --- MCP / Skills Shared List View ---
function ListView({ title, items, description, onAdd, onRemove, type }: { 
  title: string, 
  items: any[], 
  description: string,
  onAdd: () => void,
  onRemove: (id: string) => void,
  type: 'mcp' | 'skill'
}) {
  const [search, setSearch] = useState('');

  return (
    <div className="max-w-4xl mx-auto space-y-8 p-8 pb-32">
      <div className="space-y-1">
        <h2 className="text-xl font-bold text-slate-900 dark:text-white uppercase">{title}</h2>
        <p className="text-sm text-slate-500">{description}</p>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input 
            placeholder="搜索..."
            className="w-full bg-slate-100 dark:bg-white/5 border border-transparent dark:border-white/10 focus:border-blue-500/50 rounded-xl pl-10 pr-4 py-2.5 text-sm outline-none transition-all"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
        <button 
          onClick={onAdd}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition-all shadow-lg shadow-blue-600/20 active:scale-95"
        >
          <Plus className="w-4 h-4" />
          添加 {title}
        </button>
      </div>

      <div className="space-y-2 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-2">
        {items.filter(i => i.name.toLowerCase().includes(search.toLowerCase())).map(item => (
          <div key={item.id} className="group relative flex items-start gap-4 p-4 hover:bg-white dark:hover:bg-white/5 rounded-xl transition-all border border-transparent hover:border-slate-200 dark:hover:border-white/10 hover:shadow-sm">
            <div className={cn(
              "w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0 overflow-hidden",
              type === 'mcp' ? "bg-slate-200 dark:bg-slate-800 text-slate-400" : "bg-purple-500"
            )}>
               {item.icon ? <img src={item.icon} className="w-full h-full object-cover" /> : (type === 'mcp' ? <Cpu className="w-5 h-5" /> : <Puzzle className="w-5 h-5" />)}
            </div>
            <div className="flex-1 space-y-1 pr-12">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-bold text-slate-900 dark:text-white">{item.name}</h4>
                {item.isOfficial && (
                  <span className="text-[10px] bg-slate-200 dark:bg-white/20 text-slate-600 dark:text-slate-400 px-1.5 py-0.5 rounded font-bold uppercase tracking-tighter">官方</span>
                )}
              </div>
              <p className="text-xs text-slate-500 leading-relaxed line-clamp-2">{item.description}</p>
            </div>
            <div className="absolute top-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
              <button className="p-2 hover:bg-slate-100 dark:hover:bg-white/10 rounded-lg text-slate-400 hover:text-slate-600 dark:text-slate-500">
                <ExternalLink className="w-4 h-4" />
              </button>
              <button 
                onClick={() => onRemove(item.id)}
                className="p-2 hover:bg-red-500/10 rounded-lg text-slate-400 hover:text-red-500"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        ))}

        {items.filter(i => i.name.toLowerCase().includes(search.toLowerCase())).length === 0 && (
          <div className="text-center py-12 text-slate-400 text-sm italic">未发现符合条件的项</div>
        )}
      </div>
    </div>
  );
}

function MCPView({ items, onUpdate }: { items: MCPItem[], onUpdate: (m: MCPItem[]) => void }) {
  return (
    <ListView 
      title="MCP"
      items={items}
      description="标准化工具交互协议，为智能体安全连接各类外部工具与服务，灵活扩展能力边界"
      onAdd={() => alert('请在 MCP 市场中选择要添加的工具')}
      onRemove={(id) => onUpdate(items.filter(i => i.id !== id))}
      type="mcp"
    />
  );
}

function SkillsView({ items, onUpdate }: { items: SkillItem[], onUpdate: (s: SkillItem[]) => void }) {
  return (
    <ListView 
      title="技能"
      items={items}
      description="技能是步骤和执行的组合单元，为智能体赋予标准化、可复用的任务执行能力，高效落地各类业务场景"
      onAdd={() => alert('已进入技能工作台，请定义新技能流程')}
      onRemove={(id) => onUpdate(items.filter(i => i.id !== id))}
      type="skill"
    />
  );
}

// --- Knowledge Base View ---
function KnowledgeBaseView({ items, onUpdate }: { items: KnowledgeBaseItem[], onUpdate: (k: KnowledgeBaseItem[]) => void }) {
  const [isAdding, setIsAdding] = useState(false);
  const [editingItem, setEditingItem] = useState<KnowledgeBaseItem | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleSave = (item: KnowledgeBaseItem) => {
    if (editingItem) {
      onUpdate(items.map(i => i.id === item.id ? item : i));
    } else {
      onUpdate([...items, { ...item, id: `kb-${Date.now()}`, updatedAt: Date.now() }]);
    }
    setEditingItem(null);
    setIsAdding(false);
  };

  const parseFileContent = async (file: File): Promise<{ content: string; type: 'doc' | 'table' | 'file' }> => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    
    if (ext === 'txt' || ext === 'md' || ext === 'json' || ext === 'js' || ext === 'ts') {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          resolve({
            content: e.target?.result as string || '',
            type: 'doc'
          });
        };
        reader.readAsText(file);
      });
    }
    
    if (ext === 'csv' || ext === 'tsv') {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const rawContent = e.target?.result as string || '';
            const delimiter = ext === 'tsv' ? '\t' : ',';
            const lines = rawContent.split(/\r?\n/).filter(line => line.trim().length > 0);
            if (lines.length === 0) {
              resolve({ content: 'CSV 文件为空', type: 'table' });
              return;
            }
            
            let markdown = '';
            const parsedRows: string[][] = lines.map(line => {
              const cols: string[] = [];
              let current = '';
              let inQuotes = false;
              for (let i = 0; i < line.length; i++) {
                const char = line[i];
                if (char === '"') {
                  inQuotes = !inQuotes;
                } else if (char === delimiter && !inQuotes) {
                  cols.push(current.trim());
                  current = '';
                } else {
                  current += char;
                }
              }
              cols.push(current.trim());
              return cols;
            });

            const maxCols = Math.max(...parsedRows.map(r => r.length));
            if (maxCols === 0) {
              resolve({ content: '没有检测到任何数据列', type: 'table' });
              return;
            }

            const header = parsedRows[0];
            const headerCells = Array.from({ length: maxCols }, (_, colIdx) => header[colIdx] || '');
            markdown += `### CSV 数据预览\n\n`;
            markdown += `| ${headerCells.join(' | ')} |\n`;
            markdown += `| ${Array(maxCols).fill('---').join(' | ')} |\n`;

            for (let rIdx = 1; rIdx < parsedRows.length; rIdx++) {
              const row = parsedRows[rIdx];
              const cells = Array.from({ length: maxCols }, (_, colIdx) => (row[colIdx] || '').replace(/\n/g, '<br>'));
              markdown += `| ${cells.join(' | ')} |\n`;
            }

            resolve({
              content: markdown,
              type: 'table'
            });
          } catch (err) {
            resolve({
              content: `CSV/TSV 解析失败: ${err instanceof Error ? err.message : String(err)}`,
              type: 'table'
            });
          }
        };
        // Use UTF-8 / GBK compatible fallback mechanism for Chinese encodings
        reader.readAsText(file);
      });
    }

    if (ext === 'docx') {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = async (rev) => {
          try {
            const result = await mammoth.extractRawText({ arrayBuffer: rev.target?.result as ArrayBuffer });
            resolve({
              content: result.value || '未能提取到Word文档明文 (可能文档为空)',
              type: 'doc'
            });
          } catch (err) {
            resolve({
              content: `Word 提取解析错误: ${err}`,
              type: 'doc'
            });
          }
        };
        reader.readAsArrayBuffer(file);
      });
    }

    if (ext === 'pdf') {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = async (rev) => {
          try {
            const loadingTask = pdfjs.getDocument({ data: rev.target?.result as ArrayBuffer });
            const pdf = await loadingTask.promise;
            let fullText = '';
            for (let i = 1; i <= pdf.numPages; i++) {
              const page = await pdf.getPage(i);
              const textContent = await page.getTextContent();
              fullText += textContent.items.map((item: any) => item.str).join(' ') + '\n';
            }
            resolve({
              content: fullText.trim() || '未能提取到PDF明文 (可能含有多页空白或扫描图片)',
              type: 'doc'
            });
          } catch (err) {
            resolve({
              content: `PDF 提取解析错误: ${err}`,
              type: 'doc'
            });
          }
        };
        reader.readAsArrayBuffer(file);
      });
    }

    if (ext === 'xlsx' || ext === 'xls') {
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const data = new Uint8Array(e.target?.result as ArrayBuffer);
            const workbook = XLSX.read(data, { type: 'array' });
            
            let fullMarkdown = '';
            workbook.SheetNames.forEach((sheetName) => {
              const sheet = workbook.Sheets[sheetName];
              const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];
              if (!rawRows || rawRows.length === 0) return;
              
              const rows = rawRows.filter(row => row && row.length > 0 && row.some(cell => cell !== null && cell !== undefined && cell !== ''));
              if (rows.length === 0) return;
              
              fullMarkdown += `### 工作表：${sheetName}\n\n`;
              
              const maxCols = Math.max(...rows.map(r => r.length));
              const header = rows[0];
              const headerCells = Array.from({ length: maxCols }, (_, colIdx) => {
                const val = header[colIdx];
                return val !== undefined && val !== null ? String(val).trim() : '';
              });
              
              fullMarkdown += `| ${headerCells.map(h => h || `列 ${headerCells.indexOf(h) + 1}`).join(' | ')} |\n`;
              fullMarkdown += `| ${Array(maxCols).fill('---').join(' | ')} |\n`;
              
              for (let rIdx = 1; rIdx < rows.length; rIdx++) {
                const row = rows[rIdx];
                const cells = Array.from({ length: maxCols }, (_, colIdx) => {
                  const val = row[colIdx];
                  if (val === undefined || val === null) return '';
                  return String(val).trim().replace(/\n/g, '<br>').replace(/\|/g, '\\|');
                });
                fullMarkdown += `| ${cells.join(' | ')} |\n`;
              }
              fullMarkdown += `\n\n`;
            });
            
            resolve({
              content: fullMarkdown.trim() || 'Excel文件内无有效行列数据。',
              type: 'table'
            });
          } catch (err) {
            resolve({
              content: `Excel分析错误: ${err instanceof Error ? err.message : String(err)}`,
              type: 'table'
            });
          }
        };
        reader.readAsArrayBuffer(file);
      });
    }

    // Default Fallback
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        resolve({
          content: `文件名: ${file.name}\n文件大小: ${(file.size / 1024).toFixed(1)} KB\n文件解析成功，将优先注入上下文。`,
          type: 'file'
        });
      };
      reader.readAsText(file);
    });
  };

  const handleFiles = async (files: FileList) => {
    const updatedItems = [...items];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const parsed = await parseFileContent(file);
      updatedItems.push({
        id: `kb-${Date.now()}-${i}`,
        name: file.name,
        content: parsed.content,
        type: parsed.type,
        updatedAt: Date.now()
      });
    }
    onUpdate(updatedItems);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      handleFiles(e.target.files);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8 p-8 pb-32">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white uppercase flex items-center gap-2">
            <Database className="w-5 h-5 text-blue-500" />
            RAG 知识库
          </h2>
          <p className="text-sm text-slate-500">上传项目文档、Excel表格、Word手册、PDF标准等常用格式，智能体在回答时将优先基于此知识库进行 RAG 检索</p>
        </div>
        {!isAdding && !editingItem && (
          <button 
            onClick={() => setIsAdding(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition-all shadow-lg shadow-blue-600/20"
          >
            <Plus className="w-4 h-4" /> 手动录入
          </button>
        )}
      </div>

      {(isAdding || editingItem) ? (
        <KnowledgeBaseEditor 
          item={editingItem || { id: '', name: '', content: '', type: 'doc', updatedAt: 0 }} 
          onSave={handleSave} 
          onCancel={() => { setIsAdding(false); setEditingItem(null); }}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="col-span-full mb-2">
             <div className="bg-blue-500/5 border border-blue-500/10 p-4 rounded-xl flex items-center gap-4 text-blue-500 text-xs">
                <Shield className="w-5 h-5 shrink-0" />
                所有上传内容仅在本地加密向量库中使用，不会被用于公开模型训练。支持 PDF、Word、Excel、TXT、MD、CSV 等常用格式。
             </div>
          </div>
          
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={handleFileChange}
            multiple 
            accept=".xlsx,.xls,.docx,.doc,.pdf,.txt,.csv,.md,.json" 
            className="hidden" 
          />

          {items.map(item => (
            <div key={item.id} className="group p-5 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl hover:border-blue-500/30 transition-all flex flex-col gap-4">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white dark:bg-slate-800 flex items-center justify-center border border-slate-200 dark:border-white/10 text-slate-400 group-hover:text-blue-500 transition-colors">
                    <FileText className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200">{item.name}</h4>
                    <span className="text-[10px] text-slate-400 uppercase tracking-tight">{item.type} · {new Date(item.updatedAt).toLocaleDateString()}</span>
                  </div>
                </div>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                   <button onClick={() => setEditingItem(item)} className="p-2 hover:bg-white dark:hover:bg-white/10 rounded-lg text-slate-400 hover:text-blue-500"><Edit2 className="w-4 h-4"/></button>
                   <button onClick={() => onUpdate(items.filter(i => i.id !== item.id))} className="p-2 hover:bg-red-500/10 rounded-lg text-slate-400 hover:text-red-500"><Trash2 className="w-4 h-4"/></button>
                </div>
              </div>
              <p className="text-xs text-slate-500 line-clamp-3 leading-relaxed bg-white/40 dark:bg-black/20 p-2 rounded border border-black/5 dark:border-white/5 italic whitespace-pre-wrap">
                {item.content || '暂无详细内容'}
              </p>
            </div>
          ))}

          <div 
            onClick={() => fileInputRef.current?.click()}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={cn(
              "p-8 border-2 border-dashed rounded-2xl flex flex-col items-center justify-center gap-3 cursor-pointer transition-all group min-h-[160px]",
              isDragging 
                ? "border-blue-500 bg-blue-500/5 shadow-[0_0_15px_rgba(59,130,246,0.15)]" 
                : "border-slate-200 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-white/5 hover:border-blue-500/30"
            )}
          >
            <Upload className={cn("w-8 h-8 transition-colors", isDragging ? "text-blue-500" : "text-slate-300 group-hover:text-blue-400")} />
            <span className={cn("text-sm transition-colors text-center", isDragging ? "text-blue-500 font-medium" : "text-slate-400 group-hover:text-blue-400")}>
              {isDragging ? "松开鼠标立即上传" : "拖拽文件到此处 或 点击选择文件上传"}
            </span>
            <span className="text-[10px] text-slate-400 text-center">
              (支持 PDF, Word (docx), Excel (xlsx), CSV, TXT, MD)
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function KnowledgeBaseEditor({ item, onSave, onCancel }: { item: KnowledgeBaseItem, onSave: (item: KnowledgeBaseItem) => void, onCancel: () => void }) {
  const [name, setName] = useState(item.name);
  const [content, setContent] = useState(item.content);

  return (
    <div className="bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-6 space-y-6">
       <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest pl-1">知识库名称</label>
            <input 
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="例如：IPD 阶段评审要点"
              className="w-full bg-white dark:bg-[#0d1b2a] border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500/20 outline-none transition-all"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest pl-1">详实内容 / 文本提取结果</label>
            <textarea 
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder="在此输入或通过 OCR/解析得到的文本内容..."
              rows={12}
              className="w-full bg-white dark:bg-[#0d1b2a] border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm font-mono focus:ring-2 focus:ring-blue-500/20 outline-none transition-all resize-none"
            />
          </div>
       </div>
       <div className="flex justify-end gap-3">
          <button onClick={onCancel} className="px-6 py-2 rounded-xl text-sm font-medium text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5 transition-all">取消</button>
          <button 
            disabled={!name.trim()}
            onClick={() => onSave({ ...item, name, content, updatedAt: Date.now() })} 
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-xl text-sm font-medium transition-all shadow-lg shadow-blue-600/20 flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            保存设置
          </button>
       </div>
    </div>
  );
}

// --- Agents View ---
function AgentsView({ agents, onUpdate }: { agents: AgentConfig[], onUpdate: (a: AgentConfig[]) => void }) {
  const [editingAgent, setEditingAgent] = useState<AgentConfig | null>(null);

  return (
    <div className="max-w-5xl mx-auto space-y-8 p-8 pb-32">
      <div className="space-y-1">
        <h2 className="text-xl font-bold text-slate-900 dark:text-white uppercase flex items-center gap-2">
          <Bot className="w-5 h-5 text-blue-500" />
          AGENT 智能体模块
        </h2>
        <p className="text-sm text-slate-500">主 Agent 通过自适应路由编排以下 Sub-Agents。你可以通过修改提示词来微调每个专家的执行行为</p>
      </div>

      {editingAgent ? (
        <div className="bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-6 space-y-6">
           <div className="flex items-center gap-4 mb-4">
              <div className="w-12 h-12 rounded-2xl bg-blue-500/10 flex items-center justify-center text-blue-500">
                <Bot className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">{editingAgent.name}</h3>
                <p className="text-xs text-slate-500">{editingAgent.role}</p>
              </div>
           </div>
           
           <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest pl-1">专家领域提示词 (System Prompt)</label>
            <textarea 
              value={editingAgent.prompt}
              onChange={e => setEditingAgent({...editingAgent, prompt: e.target.value})}
              rows={10}
              className="w-full bg-white dark:bg-[#0d1b2a] border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 text-sm font-mono focus:ring-2 focus:ring-blue-500/20 outline-none transition-all resize-none"
            />
          </div>

          <div className="flex justify-end gap-3">
            <button onClick={() => setEditingAgent(null)} className="px-6 py-2 rounded-xl text-sm font-medium text-slate-500 hover:bg-slate-100 dark:hover:bg-white/5 transition-all">取消</button>
            <button 
              onClick={() => {
                onUpdate(agents.map(a => a.id === editingAgent.id ? editingAgent : a));
                setEditingAgent(null);
              }} 
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition-all shadow-lg shadow-blue-600/20"
            >
              保存修改
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {agents.map(agent => (
            <div key={agent.id} className="p-6 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl flex items-center justify-between group transition-all hover:bg-blue-500/[0.02] hover:border-blue-500/30">
              <div className="flex items-center gap-5 flex-1">
                <div className={cn(
                  "w-12 h-12 rounded-2xl flex items-center justify-center transition-all",
                  agent.enabled ? "bg-blue-500 text-white shadow-lg shadow-blue-500/20" : "bg-slate-200 dark:bg-slate-800 text-slate-400"
                )}>
                  <Bot className="w-6 h-6" />
                </div>
                <div className="space-y-1 pr-8">
                  <div className="flex items-center gap-3">
                    <h4 className="text-base font-bold text-slate-900 dark:text-white">{agent.name}</h4>
                    <span className="text-[10px] bg-blue-500/10 text-blue-500 px-1.5 py-0.5 rounded font-bold uppercase">{agent.role}</span>
                  </div>
                  <p className="text-xs text-slate-500 line-clamp-1 italic">{agent.prompt}</p>
                </div>
              </div>
              <div className="flex items-center gap-6">
                <button 
                  onClick={() => setEditingAgent(agent)}
                  className="px-4 py-2 text-xs font-bold text-blue-500 hover:bg-blue-500/10 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                >
                  配置提示词
                </button>
                <button 
                  onClick={() => onUpdate(agents.map(a => a.id === agent.id ? { ...a, enabled: !a.enabled } : a))}
                  className={cn(
                    "w-12 h-7 rounded-full transition-all relative",
                    agent.enabled ? "bg-blue-600" : "bg-slate-300 dark:bg-slate-700"
                  )}
                >
                  <motion.div 
                    animate={{ x: agent.enabled ? 24 : 4 }}
                    className="absolute top-1.5 w-4 h-4 bg-white rounded-full shadow-sm"
                  />
                </button>
              </div>
            </div>
          ))}
          
          <div className="p-8 border-2 border-dashed border-slate-200 dark:border-white/5 rounded-2xl flex flex-col items-center justify-center gap-3">
             <BrainCircuit className="w-8 h-8 text-slate-300" />
             <p className="text-sm text-slate-400">主 Agent 根据路由决策分发至上述专家。编排逻辑由 LangGraph 管理。</p>
          </div>
        </div>
      )}
    </div>
  );
}

// --- Memory MD View ---
function MemoryMdView({ memoryMd, onUpdate }: { memoryMd: string, onUpdate: (m: string) => void }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(memoryMd);

  return (
    <div className="max-w-5xl mx-auto space-y-8 p-8 pb-32">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-xl font-bold text-slate-900 dark:text-white uppercase flex items-center gap-2">
            <Brain className="w-5 h-5 text-blue-500" />
            MEMORY.md 长期记忆
          </h2>
          <p className="text-sm text-slate-500">反射代理（Reflection Agent）自动提炼的核心偏好与项目事实。这些内容将优先注入对话上下文</p>
        </div>
        <button 
          onClick={() => {
            if (isEditing) {
              onUpdate(editValue);
              setIsEditing(false);
            } else {
              setEditValue(memoryMd);
              setIsEditing(true);
            }
          }}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all shadow-lg",
            isEditing ? "bg-green-600 hover:bg-green-700 text-white shadow-green-600/20" : "bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-300 hover:bg-slate-200"
          )}
        >
          {isEditing ? <><Save className="w-4 h-4" /> 保存修改</> : <><Edit2 className="w-4 h-4" /> 手动修正</>}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-4">
          {isEditing ? (
            <textarea 
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              className="w-full h-[600px] bg-slate-50 dark:bg-[#0d1b2a] border border-slate-200 dark:border-white/10 rounded-2xl p-6 text-sm font-mono focus:ring-2 focus:ring-blue-500/20 outline-none transition-all resize-none"
            />
          ) : (
            <div className="bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl p-8 prose prose-slate dark:prose-invert max-w-none shadow-sm text-slate-800 dark:text-slate-100 markdown-body">
              <ReactMarkdown>{memoryMd}</ReactMarkdown>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="p-6 bg-blue-500/5 border border-blue-500/10 rounded-2xl space-y-4">
            <h4 className="text-xs font-bold text-blue-500 uppercase tracking-widest flex items-center gap-2">
              <Shield className="w-4 h-4" />
              记忆引擎规则
            </h4>
            <ul className="space-y-3">
              {[
                "提取高浓度事实 (Facts)",
                "记录用户明确表达的偏好 (Preferences)",
                "记录项目关键里程碑变更 (Milestones)",
                "自动去冗余与旧信息覆盖"
              ].map((rule, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-slate-500">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-500/40 mt-1" />
                  {rule}
                </li>
              ))}
            </ul>
          </div>

          <div className="p-6 bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-2xl space-y-4">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-widest">
              元数据
            </h4>
            <div className="space-y-2">
              <div className="flex justify-between text-[10px]">
                <span className="text-slate-500">存储格式</span>
                <span className="text-slate-400 font-mono">Markdown (UTF-8)</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="text-slate-500">字符占比</span>
                <span className="text-slate-400 font-mono">{memoryMd.length} bytes</span>
              </div>
              <div className="flex justify-between text-[10px]">
                <span className="text-slate-500">注入状态</span>
                <span className="text-green-500 font-bold">READY</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function BrainCircuit(props: any) {
  return (
    <svg 
      {...props} 
      xmlns="http://www.w3.org/2000/svg" 
      width="24" 
      height="24" 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
    >
      <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .52 8.248z" />
      <path d="M9 19a2 2 0 1 0 4 0" />
      <path d="M18 13a3 3 0 1 0-5.997-.125 4 4 0 0 0-2.526-5.77 4 4 0 0 0-3.477 4.147 4 4 0 0 0 1 7.75" />
      <path d="M12 13a3 3 0 1 0 5.997.125 4 4 0 0 0 2.526-5.77 4 4 0 0 0-.52-8.248z" />
      <path d="M15 5a2 2 0 1 0-4 0" />
    </svg>
  );
}
