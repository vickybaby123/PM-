/**
 * VoiceModule: Encapsulates Web Speech API logic (STT & TTS)
 */

export const VoiceModule = {
  // TTS Logic
  speak: (text: string, onEnd?: () => void) => {
    window.speechSynthesis.cancel();
    if (!text) return;

    const cleanText = text
      .replace(/[#*`~_]/g, '')
      .replace(/\[.*?\]/g, '')
      .trim();

    const utterance = new SpeechSynthesisUtterance(cleanText);
    
    // Ensure voices are loaded
    const selectVoice = () => {
      const voices = window.speechSynthesis.getVoices();
      const zhVoice = voices.find(v => v.lang.includes('zh-CN') && (v.name.includes('Neural') || v.name.includes('Xiaoxiao') || v.name.includes('Yunxi'))) 
                     || voices.find(v => v.lang.includes('zh-CN'));
      if (zhVoice) utterance.voice = zhVoice;
      utterance.lang = 'zh-CN';
      utterance.rate = 1.05; // Slightly faster for natural feel
      utterance.pitch = 1.0;
      window.speechSynthesis.speak(utterance);
    };

    if (window.speechSynthesis.getVoices().length === 0) {
      window.speechSynthesis.onvoiceschanged = () => {
        selectVoice();
        window.speechSynthesis.onvoiceschanged = null;
      };
    } else {
      selectVoice();
    }

    utterance.onend = () => {
      if (onEnd) onEnd();
    };

    return utterance;
  },

  stop: () => {
    window.speechSynthesis.cancel();
  },

  isSpeaking: () => {
    return window.speechSynthesis.speaking;
  },

  // STT initialization helper
  createRecognition: (onResult: (text: string) => void, onError: (err: string) => void, onEnd: () => void) => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      onError("此浏览器不支持语音识别功能，请尝试使用 Chrome 浏览器");
      return null;
    }

    let recognition: any;
    try {
      recognition = new SpeechRecognition();
    } catch (e) {
      onError("初始化语音识别失败");
      return null;
    }

    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'zh-CN';

    recognition.onresult = (event: any) => {
      const transcript = event.results[event.results.length - 1][0].transcript;
      onResult(transcript);
    };

    recognition.onerror = (event: any) => {
      console.error("Speech Recognition Error Event:", event);
      let errorMsg = "语音识别发生错误";
      if (event.error === 'not-allowed') errorMsg = "麦克风访问被拒绝，请在浏览器地址栏检查并允许权限";
      if (event.error === 'no-speech') return; // Silent timeout handled by onend
      if (event.error === 'network') errorMsg = "网络连接异常，无法进行语音识别";
      if (event.error === 'aborted') return; // Manual stop
      onError(errorMsg);
    };

    recognition.onend = onEnd;

    return recognition;
  }
};
