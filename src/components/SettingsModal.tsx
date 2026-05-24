import React from 'react';
import { X, Save, ShieldAlert, Settings, Volume2 } from 'lucide-react';
import { ProjectProfile, IPDStage } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../lib/utils';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  profile: ProjectProfile;
  onSave: (profile: ProjectProfile) => void;
}

const STAGES: { value: IPDStage; label: string }[] = [
  { value: 'concepts', label: '概念 (Concepts)' },
  { value: 'plan', label: '计划 (Plan)' },
  { value: 'develop', label: '开发 (Develop)' },
  { value: 'validate', label: '验证 (Validate)' },
  { value: 'release', label: '发布 (Release)' },
];

const CERTS = ['CCC', 'CE', 'UL', '能效标识'];

export default function SettingsModal({ isOpen, onClose, profile, onSave }: SettingsModalProps) {
  const [localProfile, setLocalProfile] = React.useState<ProjectProfile>(profile);
  const [isSaving, setIsSaving] = React.useState(false);

  React.useEffect(() => {
    setLocalProfile(profile);
  }, [profile, isOpen]);

  if (!isOpen) return null;

  const handleSave = async () => {
    setIsSaving(true);
    // Simulate brief save delay for UX feedback
    await new Promise(r => setTimeout(r, 600));
    onSave(localProfile);
    setIsSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="absolute inset-0 bg-slate-950/70 backdrop-blur-md" 
      />
      
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="w-full max-w-lg bg-[#142131] border border-white/10 rounded-2xl shadow-[0_32px_64px_-12px_rgba(0,0,0,0.6)] relative overflow-hidden"
      >
        {/* Header */}
        <div className="p-5 border-b border-white/5 flex items-center justify-between bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
              <Settings className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h2 className="font-bold text-white tracking-tight">项目画像录入</h2>
              <p className="text-[10px] text-slate-500 uppercase tracking-widest">Project Profile Setup</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/5 rounded-full transition-colors">
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto scrollbar-hide">
          {/* Project Name */}
          <div className="space-y-2">
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">项目名称</label>
            <input 
              type="text"
              value={localProfile.name}
              onChange={(e) => setLocalProfile({ ...localProfile, name: e.target.value })}
              className="w-full bg-[#0d1b2a] border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500/50 text-slate-100 transition-all placeholder:text-slate-700"
              placeholder="例如：高端变频冰箱2026款"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* IPD Stage */}
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">IPD 阶段</label>
              <select 
                value={localProfile.stage}
                onChange={(e) => setLocalProfile({ ...localProfile, stage: e.target.value as IPDStage })}
                className="w-full bg-[#0d1b2a] border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500/50 text-slate-100 appearance-none transition-all"
              >
                {STAGES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>

            {/* Launch Date */}
            <div className="space-y-2">
              <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">目标发布日期</label>
              <input 
                type="date"
                value={localProfile.targetLaunch}
                onChange={(e) => setLocalProfile({ ...localProfile, targetLaunch: e.target.value })}
                className="w-full bg-[#0d1b2a] border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500/50 text-slate-100 transition-all dark:[color-scheme:dark]"
              />
            </div>
          </div>

          {/* Certifications */}
          <div className="space-y-3">
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">所需认证</label>
            <div className="flex flex-wrap gap-2">
              {CERTS.map(c => (
                <button
                  key={c}
                  onClick={() => {
                    const next = localProfile.certRequired.includes(c)
                      ? localProfile.certRequired.filter(item => item !== c)
                      : [...localProfile.certRequired, c];
                    setLocalProfile({ ...localProfile, certRequired: next });
                  }}
                  className={cn(
                    "px-4 py-2 rounded-xl border text-[11px] font-bold transition-all uppercase tracking-tight",
                    localProfile.certRequired.includes(c)
                      ? "bg-blue-500 border-blue-400 text-white shadow-lg shadow-blue-500/20"
                      : "bg-[#0d1b2a] border-white/10 text-slate-500 hover:border-white/20"
                  )}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>

          {/* Stakeholders */}
          <div className="space-y-2">
            <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">干系人备注</label>
            <textarea 
              value={localProfile.stakeholders}
              onChange={(e) => setLocalProfile({ ...localProfile, stakeholders: e.target.value })}
              className="w-full bg-[#0d1b2a] border border-white/10 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-blue-500/50 text-slate-100 transition-all placeholder:text-slate-700 min-h-[100px] resize-none"
              placeholder="记录关键干系人的决策习惯或特殊关注点..."
            />
          </div>

          {/* TTS Setting */}
          <div className="flex items-center justify-between p-4 rounded-xl bg-slate-900 border border-white/5">
            <div className="flex items-center gap-3">
              <Volume2 className="w-5 h-5 text-blue-400" />
              <div>
                <span className="text-xs font-bold text-white uppercase tracking-tight">自动朗读回复</span>
                <p className="text-[9px] text-slate-500 uppercase tracking-widest">TTS Auto-Playback</p>
              </div>
            </div>
            <button 
              onClick={() => setLocalProfile({ ...localProfile, autoRead: !localProfile.autoRead })}
              className={cn(
                "w-10 h-5 rounded-full relative transition-colors",
                localProfile.autoRead ? "bg-blue-500" : "bg-slate-700"
              )}
            >
              <div className={cn(
                "absolute top-1 w-3 h-3 rounded-full bg-white transition-all",
                localProfile.autoRead ? "left-6" : "left-1"
              )} />
            </button>
          </div>

          {/* Alert */}
          <div className="p-4 rounded-xl bg-blue-500/5 border border-blue-500/10 flex gap-3">
            <ShieldAlert className="w-5 h-5 text-blue-400 shrink-0" />
            <div className="text-[10px] leading-relaxed text-slate-400 uppercase tracking-wide">
              Data remains local. This profile is automatically injected as <span className="text-blue-300 font-bold">[Current Project Context]</span> for all AI analyses.
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-5 border-t border-white/5 flex justify-end gap-3 bg-white/[0.02]">
          <button 
            onClick={onClose}
            className="px-5 py-2.5 text-xs font-bold text-slate-500 hover:text-slate-300 transition-colors uppercase tracking-widest"
          >
            Cancel
          </button>
          <button 
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2 bg-blue-500 hover:bg-blue-400 disabled:bg-slate-800 text-white px-6 py-2.5 rounded-xl text-xs font-bold transition-all shadow-xl shadow-blue-500/20 uppercase tracking-widest"
          >
            {isSaving ? (
              <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {isSaving ? "Saving..." : "Save Settings"}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
