import React, { useRef, useEffect, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { Send, User, Bot, Copy, Download, Trash2, Plus, X, Mic, Volume2, FileText, Image as ImageIcon, Phone } from 'lucide-react';
import { Message, Attachment, AgentConfig } from '../types';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import * as mammoth from 'mammoth';
import * as pdfjs from 'pdfjs-dist';

// Configure PDF.js worker
pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;

interface ChatAreaProps {
  messages: Message[];
  inputValue: string;
  isStreaming: boolean;
  onInputChange: (val: string | ((prev: string) => string)) => void;
  onSendMessage: () => void;
  onExport: (content: string) => void;
  onClear: () => void;
  onQuickCommand: (cmd: string) => void;
  attachments: Attachment[];
  onSetAttachments: React.Dispatch<React.SetStateAction<Attachment[]>>;
  activeAgent: string | null;
  agents: AgentConfig[];
  calledAgents: Set<string>;
}

import { VoiceModule } from '../lib/voice';

export default function ChatArea({
  messages,
  inputValue,
  isStreaming,
  onInputChange,
  onSendMessage,
  onExport,
  onClear,
  onQuickCommand,
  attachments,
  onSetAttachments,
  activeAgent,
  agents,
  calledAgents,
  onToggleCallMode
}: ChatAreaProps & { onToggleCallMode: () => void }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [playingMsgIndex, setPlayingMsgIndex] = useState<number | null>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isStreaming]);

  // STT Setup fixed: Initialize once
  useEffect(() => {
    recognitionRef.current = VoiceModule.createRecognition(
      (text: string) => {
        // Use a functional update to append text
        onInputChange((prev: any) => (prev ? prev + ' ' : '') + text); 
        // PM Optimization: Keep cursor at end
        setTimeout(() => {
          if (inputRef.current) {
            inputRef.current.focus();
            inputRef.current.setSelectionRange(inputRef.current.value.length, inputRef.current.value.length);
          }
        }, 10);
      },
      (err) => {
        alert(err);
        setIsRecording(false);
      },
      () => setIsRecording(false)
    );
  }, [onInputChange]); // Stable dependency

  const toggleRecording = () => {
    if (!recognitionRef.current) {
      // Lazy re-init if needed
      recognitionRef.current = VoiceModule.createRecognition(
        (text: string) => {
          onInputChange((prev: any) => (prev ? prev + ' ' : '') + text); 
          setTimeout(() => {
            if (inputRef.current) {
              inputRef.current.focus();
              inputRef.current.setSelectionRange(inputRef.current.value.length, inputRef.current.value.length);
            }
          }, 10);
        },
        (err) => {
          alert(err);
          setIsRecording(false);
        },
        () => setIsRecording(false)
      );
    }

    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
    } else {
      try {
        recognitionRef.current?.start();
        setIsRecording(true);
      } catch (err) {
        console.error("STT Start Error:", err);
        // Force reset and try once more after a tiny delay
        setIsRecording(false);
        recognitionRef.current = null;
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      if ((e.nativeEvent as any).isComposing) {
        return;
      }
      e.preventDefault();
      onSendMessage();
    }
  };

  const handlePaste = async (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          const reader = new FileReader();
          reader.onload = (rev) => {
            onSetAttachments(prev => [...prev, { name: 'pasted-image-' + Date.now(), type: file.type, data: rev.target?.result as string }]);
          };
          reader.readAsDataURL(file);
        }
      }
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    for (const file of Array.from(files)) {
      if (file.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onload = (rev) => {
          onSetAttachments(prev => [...prev, { name: file.name, type: file.type, data: rev.target?.result as string }]);
        };
        reader.readAsDataURL(file);
      } else if (file.type === 'application/pdf') {
        const reader = new FileReader();
        reader.onload = async (rev) => {
          const loadingTask = pdfjs.getDocument({ data: rev.target?.result as ArrayBuffer });
          const pdf = await loadingTask.promise;
          let fullText = '';
          for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const textContent = await page.getTextContent();
            fullText += textContent.items.map((item: any) => item.str).join(' ') + '\n';
          }
          onSetAttachments(prev => [...prev, { name: file.name, type: file.type, data: fullText }]);
        };
        reader.readAsArrayBuffer(file);
      } else if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
        const reader = new FileReader();
        reader.onload = async (rev) => {
          const result = await mammoth.extractRawText({ arrayBuffer: rev.target?.result as ArrayBuffer });
          onSetAttachments(prev => [...prev, { name: file.name, type: file.type, data: result.value }]);
        };
        reader.readAsArrayBuffer(file);
      } else if (file.type === 'text/plain') {
        const reader = new FileReader();
        reader.onload = (rev) => {
          onSetAttachments(prev => [...prev, { name: file.name, type: file.type, data: rev.target?.result as string }]);
        };
        reader.readAsText(file);
      }
    }
  };

  const handlePlayTTS = (text: string, index: number) => {
    if (playingMsgIndex === index) {
      VoiceModule.stop();
      setPlayingMsgIndex(null);
    } else {
      setPlayingMsgIndex(index);
      VoiceModule.speak(text, () => setPlayingMsgIndex(null));
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-[#0d1b2a] relative overflow-hidden">
      {/* Messages */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-6 py-8 space-y-8 max-w-4xl mx-auto w-full scrollbar-hide scroll-smooth"
      >
        {/* Agent Status Bar */}
        <div className="flex flex-wrap items-center justify-center gap-4 py-4 border-b border-white/5 mb-8">
          {agents.map(agent => {
            const isCurrentlyActive = activeAgent?.startsWith(agent.name);
            const wasCalled = calledAgents.has(agent.name);
            
            return (
              <div 
                key={agent.id} 
                className={cn(
                  "flex items-center gap-2 transition-all duration-500",
                  (isCurrentlyActive || wasCalled) ? "opacity-100" : "opacity-30 grayscale"
                )}
              >
                <div className="relative">
                  <div className={cn(
                    "w-2 h-2 rounded-full transition-all duration-300",
                    isCurrentlyActive ? "bg-green-400 animate-pulse shadow-[0_0_8px_rgba(74,222,128,0.6)]" : 
                    wasCalled ? "bg-green-600 shadow-[0_0_4px_rgba(22,163,74,0.4)]" : "bg-slate-600"
                  )} />
                </div>
                <span className={cn(
                  "text-[10px] font-bold uppercase tracking-widest",
                  (isCurrentlyActive || wasCalled) ? "text-blue-100" : "text-slate-500"
                )}>
                  {agent.name.replace('Agent', '')}
                </span>
              </div>
            );
          })}
        </div>

        <AnimatePresence initial={false}>
          {messages.length === 0 ? (
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="h-full flex flex-col items-center justify-center text-slate-500 space-y-6"
            >
              <div className="w-16 h-16 rounded-2xl bg-blue-500 flex items-center justify-center font-bold text-white text-2xl shadow-2xl shadow-blue-500/20">P</div>
              <div className="text-center space-y-2">
                <h2 className="text-xl font-bold text-white tracking-tight">PM-CoPilot 1.0</h2>
                <p className="text-sm text-slate-400 font-medium">支持图片识别、文档分析及语音交互</p>
              </div>
            </motion.div>
          ) : (
            messages.map((m, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={cn(
                  "flex gap-4 w-full",
                  m.role === 'user' ? "flex-row-reverse" : "flex-row"
                )}
              >
                <div className={cn(
                  "w-10 h-10 rounded-full flex-shrink-0 flex items-center justify-center text-sm font-bold shadow-lg",
                  m.role === 'user' 
                    ? "bg-slate-700 text-slate-200" 
                    : "bg-blue-600 text-white shadow-blue-600/30"
                )}>
                  {m.role === 'user' ? "JD" : "AI"}
                </div>
                <div className={cn(
                  "flex flex-col gap-2 max-w-[80%]",
                  m.role === 'user' ? "items-end" : "items-start"
                )}>
                  <div className={cn(
                    "p-5 rounded-2xl relative group shadow-sm font-sans",
                    m.role === 'user' 
                      ? "bg-blue-600 text-white rounded-tr-none shadow-blue-900/20" 
                      : "bg-[#1a2942] border border-white/5 text-slate-100 rounded-tl-none"
                  )}>
                    <div className="markdown-body text-sm leading-relaxed">
                      <ReactMarkdown>{m.content}</ReactMarkdown>
                    </div>
                    
                    {/* Message Actions */}
                    <div className={cn(
                      "flex items-center gap-2 mt-4 transition-opacity",
                      m.role === 'user' ? "hidden" : "justify-start"
                    )}>
                      {m.role === 'model' && (
                        <>
                          <button 
                            onClick={() => handlePlayTTS(m.content, i)}
                            className={cn(
                              "flex items-center gap-1.5 px-2 py-1 rounded bg-blue-500/10 border border-blue-500/20 text-[10px] font-bold uppercase transition-all",
                              playingMsgIndex === i ? "text-emerald-400 border-emerald-400/30 bg-emerald-400/5" : "text-blue-400 hover:bg-blue-500/20"
                            )}
                            title={playingMsgIndex === i ? "停止播放" : "语音解析"}
                          >
                            <Volume2 className={cn("w-3 h-3", playingMsgIndex === i && "animate-pulse")} />
                            {playingMsgIndex === i ? "Reading..." : "Play Voice"}
                          </button>
                          <button 
                            onClick={() => navigator.clipboard.writeText(m.content)}
                            className="p-1 px-2 border border-white/10 rounded text-[10px] text-slate-500 hover:text-white transition-colors"
                            title="复制原文"
                          >
                            <Copy className="w-3 h-3 inline mr-1" />
                            Copy
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  <span className="text-[10px] text-slate-500 px-1 font-mono uppercase tracking-[0.1em]">
                    {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    {m.role === 'model' && " • Voice Output Active"}
                  </span>
                </div>
              </motion.div>
            ))
          )}
          {isStreaming && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex gap-4 w-full flex-row"
            >
              <div className="w-10 h-10 rounded-full bg-blue-600 flex-shrink-0 flex items-center justify-center text-sm font-bold shadow-lg shadow-blue-600/30 text-white">AI</div>
              <div className="bg-[#1a2942] border border-white/5 p-5 rounded-2xl rounded-tl-none shadow-sm flex items-center gap-1">
                <div className="thinking-dot" />
                <div className="thinking-dot" />
                <div className="thinking-dot" />
              </div>
            </motion.div>
          )}
          {isStreaming && (
            <div className="flex justify-start items-center gap-3 mb-6">
              <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <Bot className="w-5 h-5 text-blue-400 animate-pulse" />
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-blue-500/5 border border-blue-500/10">
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500"></span>
                </span>
                <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">
                  {activeAgent || "Routing意图解析..."}
                </span>
              </div>
            </div>
          )}
        </AnimatePresence>
      </div>

      {/* Input Area */}
      <div className="p-6 bg-gradient-to-t from-[#0d1b2a] via-[#0d1b2a] to-transparent">
        <div className="max-w-4xl mx-auto flex flex-col gap-4">
          
          {/* Attachment Previews */}
          <AnimatePresence>
            {attachments.length > 0 && (
              <motion.div 
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="flex flex-wrap gap-3 overflow-hidden mb-2"
              >
                {attachments.map((att, idx) => (
                  <motion.div 
                    key={idx}
                    initial={{ scale: 0.8 }}
                    animate={{ scale: 1 }}
                    className="relative w-16 h-16 rounded-xl bg-slate-800 border border-white/10 group overflow-hidden"
                  >
                    {att.type.startsWith('image/') ? (
                      <img src={att.data} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center p-2">
                        <FileText className="w-6 h-6 text-blue-400" />
                        <span className="text-[8px] text-slate-500 truncate w-full text-center mt-1">{att.name}</span>
                      </div>
                    )}
                    <button 
                      onClick={() => onSetAttachments(prev => prev.filter((_, i) => i !== idx))}
                      className="absolute top-1 right-1 bg-black/50 hover:bg-red-500 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </motion.div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Quick Suggestions */}
          <div className="flex gap-2 items-center overflow-x-auto pb-1 scrollbar-hide">
            {[
              { label: "📸 Analyze Photo", cmd: "请分析这张图表中的关键数据点" },
              { label: "📄 Doc Review", cmd: "请对这份文档进行合规性审查" },
              { label: "📊 Generate Brief", cmd: "基于以上项目信息，生成今日项目早报" },
              { label: "⚠️ Risk Scan", cmd: "扫描当前项目，识别未来7天的潜在风险" },
            ].map((btn) => (
              <button 
                key={btn.label}
                onClick={() => onQuickCommand(btn.cmd)}
                className="px-3 py-1.5 rounded-full bg-[#1a2942] border border-white/10 text-[11px] text-slate-400 hover:text-white hover:border-white/20 whitespace-nowrap transition-all uppercase tracking-tighter font-medium"
              >
                {btn.label}
              </button>
            ))}
          </div>

          <div className="relative flex items-end gap-3 bg-[#1a2942] border border-white/10 rounded-2xl p-3 shadow-2xl transition-all focus-within:border-blue-500/40">
            <input 
              type="file" 
              multiple 
              className="hidden" 
              ref={fileInputRef} 
              onChange={handleFileChange}
              accept="image/*, .pdf, .txt, .docx" 
            />
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="p-2.5 hover:bg-white/5 text-slate-400 rounded-xl transition-all flex-shrink-0"
            >
              <Plus className="w-5 h-5" />
            </button>
            
            <textarea
              ref={inputRef}
              value={inputValue}
              onChange={(e) => onInputChange(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder={isRecording ? "正在倾听..." : "输入指令或上传项目资料..."}
              rows={2}
              className="flex-1 bg-transparent border-none text-sm focus:ring-0 placeholder:text-slate-600 resize-none text-slate-100 min-h-[48px] py-1"
              onInput={(e) => {
                const target = e.target as HTMLTextAreaElement;
                target.style.height = 'auto';
                target.style.height = `${target.scrollHeight}px`;
              }}
            />

            <div className="flex items-center gap-2 flex-shrink-0">
              <button 
                onClick={onToggleCallMode}
                className="p-2.5 hover:bg-blue-500/10 text-blue-400 rounded-xl transition-all"
                title="开启通话模式"
              >
                <Phone className="w-5 h-5" />
              </button>
              <button 
                onClick={toggleRecording}
                className={cn(
                  "p-2.5 rounded-xl transition-all relative overflow-hidden",
                  isRecording ? "bg-red-500/20 border border-red-500/40 text-red-500 shadow-[0_0_15px_rgba(239,68,68,0.3)]" : "hover:bg-white/5 text-slate-400"
                )}
              >
                <Mic className={cn("w-5 h-5", isRecording && "animate-pulse")} />
                {isRecording && (
                   <div className="absolute inset-x-0 bottom-1 flex justify-center gap-0.5">
                     <span className="w-1 h-1 bg-red-500 rounded-full animate-bounce" style={{ animationDelay: '0s' }} />
                     <span className="w-1 h-1 bg-red-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                     <span className="w-1 h-1 bg-red-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                   </div>
                )}
              </button>
              <button 
                onClick={onSendMessage}
                disabled={(!inputValue.trim() && attachments.length === 0) || isStreaming}
                className="bg-blue-500 hover:bg-blue-400 disabled:bg-slate-700 disabled:opacity-50 text-white p-2.5 rounded-xl transition-all shadow-lg shadow-blue-500/30"
              >
                <Send className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="flex justify-center items-center gap-4">
            <p className="text-[10px] text-slate-600 uppercase tracking-widest font-medium">
              Multimodal Engine Active • Optical Recognition Enabled
            </p>
            <button 
              onClick={onClear}
              className="text-[9px] text-slate-600 hover:text-red-400 transition-colors uppercase tracking-[0.2em] font-bold"
            >
              Clear Session
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
