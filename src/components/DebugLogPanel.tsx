import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Terminal, 
  ChevronDown, 
  ChevronRight, 
  Clock, 
  Cpu, 
  FileText, 
  CheckCircle2, 
  XCircle,
  Download,
  Search
} from 'lucide-react';
import { ExecutionLog } from '../types';
import { cn } from '../lib/utils';

interface DebugLogPanelProps {
  logs: ExecutionLog[];
  activeAgent: string | null;
  onExport: () => void;
}

export function DebugLogPanel({ logs, activeAgent, onExport }: DebugLogPanelProps) {
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  return (
    <div className="flex flex-col h-full bg-[#0d1117] text-[#c9d1d9] font-mono text-[11px]">
      <div className="p-4 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-blue-400" />
          <span className="font-bold text-xs uppercase tracking-widest text-slate-400">Trace Logs</span>
        </div>
        <button 
          onClick={onExport}
          className="p-1.5 hover:bg-white/5 rounded-md text-slate-500 hover:text-white transition-colors"
          title="Export Logs"
        >
          <Download className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-2 scrollbar-thin scrollbar-thumb-white/10">
        {activeAgent && (
          <div className="p-3 bg-blue-500/5 border border-blue-500/10 rounded-lg animate-pulse mb-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="w-2 h-2 bg-blue-500 rounded-full animate-ping" />
              <span className="text-blue-400 font-bold uppercase tracking-tight">Active: {activeAgent.split(':')[0]}</span>
            </div>
            <p className="text-blue-400/60 text-[10px] leading-tight mt-1">{activeAgent.split(':')[1] || 'Executing...'}</p>
          </div>
        )}

        <AnimatePresence initial={false}>
          {logs.slice().reverse().map((log, index) => (
            <motion.div
              key={log.id || `log-${index}`}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn(
                "group border rounded-lg transition-all",
                expandedLogId === (log.id || `log-${index}`) 
                  ? "bg-white/[0.03] border-white/10" 
                  : "bg-transparent border-transparent hover:border-white/10"
              )}
            >
              <div 
                onClick={() => setExpandedLogId(expandedLogId === (log.id || `log-${index}`) ? null : (log.id || `log-${index}`))}
                className="p-2 cursor-pointer flex items-center gap-3"
              >
                {expandedLogId === (log.id || `log-${index}`) ? <ChevronDown className="w-3 h-3 text-slate-500" /> : <ChevronRight className="w-3 h-3 text-slate-500" />}
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="font-bold text-blue-400 uppercase tracking-tighter truncate">{log.agent_name}</span>
                    <span className="text-slate-600">|</span>
                    <span className="text-slate-400 truncate">{log.action}</span>
                  </div>
                  <div className="flex items-center gap-3 text-[9px] text-slate-600">
                    <div className="flex items-center gap-1">
                      <Clock className="w-2.5 h-2.5" />
                      {new Date(log.timestamp).toLocaleTimeString([], { hour12: false })}
                    </div>
                    <div className="flex items-center gap-1">
                      <Cpu className="w-2.5 h-2.5" />
                      {log.execution_time_ms.toFixed(1)}ms
                    </div>
                  </div>
                </div>

                {log.status === 'success' ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-500/50" />
                ) : (
                  <XCircle className="w-3.5 h-3.5 text-red-500/50" />
                )}
              </div>

              {expandedLogId === (log.id || `log-${index}`) && (
                <div className="px-8 pb-3 pt-1 space-y-2 border-t border-white/5 bg-black/20 text-[10px]">
                  {log.input_query && (
                    <div className="space-y-1">
                      <span className="text-slate-500 flex items-center gap-1"><Search className="w-2.5 h-2.5" /> Input Query:</span>
                      <p className="text-slate-300 italic">"{log.input_query}"</p>
                    </div>
                  )}

                  {log.affected_files.length > 0 && (
                    <div className="space-y-1">
                      <span className="text-slate-500 flex items-center gap-1"><FileText className="w-2.5 h-2.5" /> Affected Files:</span>
                      <div className="flex flex-wrap gap-1">
                        {log.affected_files.map(file => (
                          <span key={file} className="px-1.5 py-0.5 bg-blue-500/10 text-blue-400/80 rounded border border-blue-500/20">
                            {file}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="space-y-1">
                    <span className="text-slate-500">Node Details:</span>
                    <pre className="p-2 bg-black/40 rounded border border-white/5 text-slate-400 overflow-x-auto whitespace-pre-wrap">
                      {JSON.stringify(log.details, null, 2)}
                    </pre>
                  </div>
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      <div className="p-2 border-t border-white/5 bg-black/40 text-[9px] flex items-center justify-between text-slate-500">
        <span>Session: 0x{logs[0]?.session_id.slice(-6).toUpperCase() || 'N/A'}</span>
        <span>{logs.length} Operations</span>
      </div>
    </div>
  );
}
