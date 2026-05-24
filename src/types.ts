export type IPDStage = 'concepts' | 'plan' | 'develop' | 'validate' | 'release';

export interface CorrectedRule {
  rule: string;
  timestamp: number;
  weight: 'HIGHEST';
  source: 'user_correction';
}

export interface Attachment {
  name: string;
  type: string;
  data: string; // Base64 for images, Text for files
}

export interface ProjectProfile {
  name: string;
  stage: IPDStage;
  targetLaunch: string;
  certRequired: string[];
  stakeholders: string;
  autoRead?: boolean; // TTS setting
}

export interface RiskPattern {
  description: string;
  timestamp: number;
  level: 'low' | 'medium' | 'high';
}

export interface Message {
  role: 'user' | 'model';
  content: string;
  timestamp: number;
}

export interface Persona {
  name: string;
  avatar: string;
  description: string;
  responsibilities: string;
  constraints: string;
}

export interface SettingsTool {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
}

export interface MCPItem {
  id: string;
  name: string;
  description: string;
  icon: string;
  isOfficial?: boolean;
}

export interface SkillItem {
  id: string;
  name: string;
  description: string;
  icon: string;
  isOfficial?: boolean;
}

export interface KnowledgeBaseItem {
  id: string;
  name: string;
  content: string;
  type: 'doc' | 'table' | 'file';
  updatedAt: number;
}

export interface AgentConfig {
  id: string;
  name: string;
  role: string;
  prompt: string;
  enabled: boolean;
}

export interface ExecutionLog {
  id?: string;
  timestamp: string;
  session_id: string;
  agent_name: string;
  action: string;
  input_query?: string;
  affected_files: string[];
  status: 'success' | 'failed';
  execution_time_ms: number;
  token_usage: {
    prompt: number;
    completion: number;
  };
  details: Record<string, any>;
}

export interface MemoryVault {
  shortTerm: Message[];
  memoryMd: string; // The virtual MEMORY.md content
  longTerm: {
    projectProfile: ProjectProfile;
    correctedRules: CorrectedRule[];
    decisionHistory: { decision: string; timestamp: number }[];
    riskPatterns: RiskPattern[];
    persona: Persona;
    tools: SettingsTool[];
    mcp: MCPItem[];
    skills: SkillItem[];
    knowledgeBase: KnowledgeBaseItem[];
    agents: AgentConfig[];
    logs: ExecutionLog[];
  };
}
