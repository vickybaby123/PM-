import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { PhoneOff, Mic, MicOff, Volume2, Bot } from 'lucide-react';
import { VoiceModule } from '../lib/voice';
import { cn } from '../lib/utils';
import { Message, MemoryVault, ExecutionLog } from '../types';
import { sendMessageStream } from '../services/gemini';

interface VoiceCallOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  memory: MemoryVault;
  onNewMessage: (msg: Message) => void;
  onLogUpdate?: (log: ExecutionLog) => void;
  onMemoryUpdate?: (newMd: string) => void;
}

export default function VoiceCallOverlay({ isOpen, onClose, memory, onNewMessage, onLogUpdate, onMemoryUpdate }: VoiceCallOverlayProps) {
  const [status, setStatus] = useState<'idle' | 'listening' | 'thinking' | 'speaking'>('idle');
  const [transcript, setTranscript] = useState('');
  const recognitionRef = useRef<any>(null);
  const isMounted = useRef(true);

  useEffect(() => {
    isMounted.current = true;
    return () => { isMounted.current = false; VoiceModule.stop(); };
  }, []);

  // Initialize Recognition
  useEffect(() => {
    if (!isOpen) return;

    recognitionRef.current = VoiceModule.createRecognition(
      (text) => {
        setTranscript(text);
        handleProcessVoiceInput(text);
      },
      (err) => {
        console.error("STT Call Mode Error:", err);
        setStatus('idle');
      },
      () => {
        if (isMounted.current && status === 'listening') {
          // Restart listening if we haven't started thinking
          // This handles silence timeouts
          startListening();
        }
      }
    );

    // Initial start
    startListening();

    return () => {
      recognitionRef.current?.stop();
    };
  }, [isOpen]);

  const startListening = () => {
    try {
      recognitionRef.current?.start();
      setStatus('listening');
      setTranscript('');
    } catch (e) {
      // Already running
    }
  };

  const handleProcessVoiceInput = async (text: string) => {
    if (!text.trim()) return;
    
    recognitionRef.current?.stop();
    setStatus('thinking');

    const userMessage: Message = {
      role: 'user',
      content: text,
      timestamp: Date.now(),
    };
    onNewMessage(userMessage);

    try {
      const stream = sendMessageStream(
        text, 
        memory.shortTerm, 
        memory, 
        undefined, 
        (agent) => {
          if (isMounted.current) setTranscript(agent);
        },
        (log) => onLogUpdate?.(log),
        (newMd) => onMemoryUpdate?.(newMd)
      );
      let fullResponse = '';
      
      for await (const chunk of stream) {
        fullResponse += chunk;
      }

      const aiMessage: Message = {
        role: 'model',
        content: fullResponse,
        timestamp: Date.now(),
      };
      onNewMessage(aiMessage);

      setStatus('speaking');
      VoiceModule.speak(fullResponse, () => {
        if (isMounted.current) {
          startListening();
        }
      });
    } catch (error) {
      console.error("Call Mode AI Error:", error);
      setStatus('idle');
      VoiceModule.speak("抱歉，我遇到了一些问题。请再说一遍。", () => {
        if (isMounted.current) startListening();
      });
    }
  };

  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] bg-slate-950 flex flex-col items-center justify-center p-6"
    >
      {/* Background Glow */}
      <div className={cn(
        "absolute inset-0 bg-blue-500/5 transition-all duration-1000",
        status === 'listening' && "bg-emerald-500/10",
        status === 'speaking' && "bg-blue-500/20",
        status === 'thinking' && "bg-purple-500/10"
      )} />

      {/* Main Avatar / Visualizer */}
      <div className="relative z-10 flex flex-col items-center space-y-12">
        <div className="relative">
          <motion.div
            animate={{
              scale: status === 'listening' ? [1, 1.2, 1] : 1,
              opacity: status === 'listening' ? [0.3, 0.6, 0.3] : 0.2
            }}
            transition={{ repeat: Infinity, duration: 2 }}
            className="absolute -inset-16 bg-blue-500 rounded-full blur-3xl"
          />
          
          <div className={cn(
            "w-32 h-32 rounded-full border-4 flex items-center justify-center transition-all duration-500 bg-slate-900 shadow-2xl",
            status === 'listening' ? "border-emerald-500 shadow-emerald-500/20" : "border-blue-500 shadow-blue-500/20"
          )}>
            <Bot className={cn(
              "w-16 h-16 transition-colors duration-500",
              status === 'listening' ? "text-emerald-400" : "text-blue-400"
            )} />
          </div>
        </div>

        <div className="text-center space-y-4">
          <h2 className="text-2xl font-bold text-white tracking-tight">
            {status === 'listening' && "正在倾听..."}
            {status === 'thinking' && "正在思考..."}
            {status === 'speaking' && "正在播报..."}
            {status === 'idle' && "准备就绪"}
          </h2>
          <p className="text-slate-400 text-sm max-w-xs mx-auto animate-pulse">
            {transcript || "PM-CoPilot 随时待命"}
          </p>
        </div>

        {/* Waves Animation */}
        {status === 'speaking' && (
          <div className="flex items-center gap-1 h-8">
            {[...Array(5)].map((_, i) => (
              <motion.div
                key={i}
                animate={{ height: [8, 32, 8] }}
                transition={{ repeat: Infinity, duration: 0.5, delay: i * 0.1 }}
                className="w-1 bg-blue-400 rounded-full"
              />
            ))}
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="absolute bottom-16 z-20 flex items-center gap-8">
        <button
          onClick={() => {
            VoiceModule.stop();
            recognitionRef.current?.stop();
            onClose();
          }}
          className="w-16 h-16 rounded-full bg-red-500 flex items-center justify-center text-white shadow-2xl shadow-red-500/40 hover:bg-red-600 transition-all active:scale-90"
          title="挂断"
        >
          <PhoneOff className="w-8 h-8" />
        </button>
      </div>

      <div className="absolute top-12 text-[10px] text-slate-500 uppercase tracking-[0.3em] font-bold">
        Hands-Free Realtime Voice Mode
      </div>
    </motion.div>
  );
}
