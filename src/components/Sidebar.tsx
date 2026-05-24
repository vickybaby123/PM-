import React from 'react';
import ReactMarkdown from 'react-markdown';
import { 
  ClipboardCheck, 
  Settings, 
  BrainCircuit, 
  Search,
  User,
  Brain,
  Wrench,
  Cpu,
  Puzzle,
  Layout,
  History,
  BarChart3,
  Database,
  Bot,
  Terminal
} from 'lucide-react';
import { MemoryVault, ProjectProfile } from '../types';
import { cn } from '../lib/utils';

interface SidebarProps {
  memory: MemoryVault;
  onOpenSettings: () => void;
  onQuickCommand: (cmd: string) => void;
  activeSettingId: string;
  onSelectSetting: (id: string) => void;
  onSwitchToChat: () => void;
  currentView: 'chat' | 'settings';
}

export default function Sidebar({ 
  memory, 
  onOpenSettings, 
  onQuickCommand,
  activeSettingId,
  onSelectSetting,
  onSwitchToChat,
  currentView
}: SidebarProps) {
  const profile = memory.longTerm.projectProfile;

  const menuGroups = [
    {
      label: '基本设定',
      items: [
        { id: 'persona', label: '人设', icon: User },
        { id: 'memory', label: '记忆', icon: Brain },
      ]
    },
    {
      label: '能力中心',
      items: [
        { id: 'tools', label: '内置工具', icon: Wrench },
        { id: 'rag', label: 'RAG 知识库', icon: Database },
        { id: 'agents', label: 'AGENT 模块', icon: Bot },
        { id: 'logs', label: '执行日志', icon: Terminal },
        { id: 'mcp', label: 'MCP', icon: Cpu },
        { id: 'skills', label: '技能', icon: Puzzle },
      ]
    },
    {
      label: '发布与管理',
      items: [
        { id: 'history', label: '版本历史', icon: History },
        { id: 'analytics', label: '使用分析', icon: BarChart3 },
      ]
    }
  ];

  return (
    <aside className="w-[280px] bg-[#1a2942] border-r border-white/5 flex flex-col p-5 shrink-0 overflow-hidden">
      {/* Agent Settings Header */}
      <div className="flex items-center justify-between mb-8 px-1">
        <h2 className="text-lg font-bold text-white tracking-tight">智能体设置</h2>
        <Layout className="w-5 h-5 text-slate-500 cursor-pointer hover:text-slate-300" />
      </div>

      <div className="space-y-8 flex-1 overflow-y-auto scrollbar-hide">
        {menuGroups.map((group) => (
          <div key={group.label} className="space-y-3">
            <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest px-2">
              {group.label}
            </h3>
            <div className="space-y-1">
              {group.items.map((item) => {
                const Icon = item.icon;
                const isActive = currentView === 'settings' && activeSettingId === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => onSelectSetting(item.id)}
                    className={cn(
                      "w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all font-medium text-sm",
                      isActive 
                        ? "bg-white/10 text-white" 
                        : "text-slate-400 hover:bg-white/5 hover:text-slate-200"
                    )}
                  >
                    <Icon className={cn("w-4 h-4", isActive ? "text-blue-400" : "opacity-60")} />
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
        
        {/* Memory Overview Card */}
        <div className="pt-2 border-t border-white/5">
          <div className="p-4 bg-white/5 border border-white/10 rounded-2xl space-y-3 group hover:border-blue-500/30 transition-all cursor-pointer"
               onClick={() => onSelectSetting('memory')}>
            <div className="flex items-center justify-between">
              <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                <BrainCircuit className="w-3.5 h-3.5 text-blue-400" />
                记忆概览 (Reflected)
              </h3>
              <Settings className="w-3 h-3 text-slate-500 opacity-0 group-hover:opacity-100" />
            </div>
            <div className="space-y-1.5 max-h-24 overflow-y-auto pr-1 scrollbar-hide text-[10px] text-slate-400 leading-relaxed">
              <ReactMarkdown>
                {memory.memoryMd.split('\n').filter(l => l.startsWith('-')).slice(0, 4).join('\n') || '暂无长期记忆'}
              </ReactMarkdown>
            </div>
          </div>
        </div>

        {/* Today Brief Section (Moved inside scroll) */}
        <div className="pt-2 border-t border-white/5">
          <h3 className="text-[11px] font-bold text-slate-500 uppercase tracking-widest px-2 mb-3">
            快速启动
          </h3>
          <div className="bg-[#0d1b2a] rounded-xl p-4 border border-blue-500/10 group cursor-pointer hover:bg-blue-500/5 transition-all"
               onClick={() => onQuickCommand("基于以上项目信息，生成今日项目早报")}>
            <p className="text-xs text-slate-400 leading-relaxed font-sans">
              <span className="text-blue-400 font-medium">点击生成</span>：分析当前 IPD 阶段风险与关键路径。
            </p>
          </div>
        </div>
      </div>

      {/* Project Status Section */}
      <div className="mt-auto bg-[#0d1b2a] p-4 rounded-xl border border-white/10">
        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3 text-center">📊 项目状态分析</h3>
        <div className="flex justify-around items-end h-16 gap-1.5 pb-1">
          {['concepts', 'plan', 'develop', 'validate', 'release'].map((s, idx) => {
            const heights = ['h-full', 'h-3/4', 'h-1/2', 'h-4/5', 'h-1/3'];
            const isActive = profile.stage === s;
            return (
              <div 
                key={s} 
                className={cn(
                  "w-3.5 rounded-t-sm transition-all duration-500",
                  heights[idx],
                  isActive 
                    ? "bg-blue-500 shadow-[0_0_12px_rgba(59,130,246,0.5)]" 
                    : "bg-blue-500/10"
                )} 
              />
            );
          })}
        </div>
        <div className="text-[10px] text-center mt-3 text-slate-500 uppercase tracking-wider font-mono">
          IPD Phase: <span className="text-blue-400 font-bold">{profile.stage.toUpperCase()}</span>
        </div>
      </div>

      <div className="flex items-center justify-center gap-1.5 text-[9px] text-slate-600 mt-4 uppercase tracking-[0.2em]">
        <div className="w-1 h-1 rounded-full bg-green-500 animate-pulse" />
        Local Knowledge Active
      </div>
    </aside>
  );
}
