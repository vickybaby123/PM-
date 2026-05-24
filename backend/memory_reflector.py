import os
import re
import datetime
import asyncio
from typing import List, Dict, Any, Tuple
from langchain_google_genai import ChatGoogleGenerativeAI

MEMORY_FILE_PATH = "MEMORY.md"

def verify_memory_integrity(memory_filepath: str = MEMORY_FILE_PATH) -> bool:
    """
    Self-Checking Mechanism:
    Validates MEMORY.md syntax structure, trigger/thought/fact format,
    and chronological order of timestamps. Outputs colored logs to the console on errors.
    """
    if not os.path.exists(memory_filepath):
        # File doesn't exist yet, which is safe initially but let's notify
        print(f"\033[93m[MEMORY INTEGRITY] File {memory_filepath} does not exist yet. Creating a fresh default template.\033[0m")
        # Initialize default template
        initial_content = """# MEMORY.md 长期记忆
反射代理（Reflection Agent）自动提炼的核心偏好与项目事实。这些内容将优先注入对话上下文。

"""
        with open(memory_filepath, "w", encoding="utf-8") as f:
            f.write(initial_content)
        return True

    try:
        with open(memory_filepath, "r", encoding="utf-8") as f:
            content = f.read()

        # Regular Expression to find headers of entries: ### [YYYY-MM-DD HH:mm:ss] Title
        # Matching ### [2026-05-24 14:05:53] some memory
        header_pattern = r"### \[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\] ([^\n]+)"
        headers = re.findall(header_pattern, content)
        
        # Split content using the headers to validate individual block content
        blocks = re.split(r"### \[\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\] [^\n]+", content)[1:]

        errors = []
        timestamps: List[datetime.datetime] = []

        if len(headers) != len(blocks):
            errors.append(f"块数量不匹配! 检测到 {len(headers)} 个头部，但分离出 {len(blocks)} 个内容体。")

        for idx, (ts_str, title) in enumerate(headers):
            # Parse timestamp to assert chronological order
            try:
                dt = datetime.datetime.strptime(ts_str, "%Y-%m-%d %H:%M:%S")
                timestamps.append(dt)
            except ValueError:
                errors.append(f"条目 {idx+1} '{title}' 中的时间戳格式非法: '{ts_str}' (必须为 YYYY-MM-DD HH:mm:ss)")
                continue

            block_content = blocks[idx]
            
            # Match fields checking Chinese/English colons
            has_trigger = re.search(r"-\s+\*\*触发表点\*\*：|-\s+\*\*触发表点\*\*:", block_content)
            has_thought = re.search(r"-\s+\*\*AI\s*提炼思考\s*\(Thought\s*Process\)\*\*：|-\s+\*\*AI\s*提炼思考\s*\(Thought\s*Process\)\*\*:", block_content)
            has_fact = re.search(r"-\s+\*\*沉淀事实\*\*：|-\s+\*\*沉淀事实\*\*:|-\s+\*\*沉淀事实\s*\(Fact\)\*\*：|-\s+\*\*沉淀事实\s*\(Fact\)\*\*:", block_content)

            if not has_trigger:
                errors.append(f"条目 {idx+1} [{ts_str}] {title}: 缺失或不匹配 '- **触发表点**：'")
            if not has_thought:
                errors.append(f"条目 {idx+1} [{ts_str}] {title}: 缺失或不匹配 '- **AI 提炼思考 (Thought Process)**：'")
            if not has_fact:
                errors.append(f"条目 {idx+1} [{ts_str}] {title}: 缺失或不匹配 '- **沉淀事实 (Fact)**：'")

        # Chronological index verification
        for i in range(1, len(timestamps)):
            if timestamps[i] < timestamps[i-1]:
                errors.append(f"时间戳连续性冲突! 后续条目时间 [{headers[i][0]}] 早于先前条目时间 [{headers[i-1][0]}]")

        if errors:
            print("\033[1;41;37m" + "!" * 90 + "\033[0m")
            print("\033[1;31m[MEMORY INTEGRITY ERROR] 记忆文件 MEMORY.md 校验未通过，检测到以下结构缺陷:\033[0m")
            for err in errors:
                print(f"  \033[1;33m⚠️ {err}\033[0m")
            print("\033[1;41;37m" + "!" * 90 + "\033[0m")
            return False

        print(f"\033[1;32m[MEMORY INTEGRITY OK] MEMORY.md 语法结构、字段完备度与时间线连续性验证全部通过! 共 {len(headers)} 条记忆审计记录。\033[0m")
        return True

    except Exception as e:
        print(f"\033[1;41;37m[MEMORY INTEGRITY ERROR] 解析 MEMORY.md 遭遇未捕获的严重异常: {str(e)}\033[0m")
        return False


async def reflect_long_term_memory(messages: List[Dict[str, Any]], current_time_str: str) -> Tuple[bool, str, str]:
    """
    Invokes Gemini to analyze the recent conversation session.
    Determines if there is a 'negation / correction / factual updating' instruction or preference change.
    Outputs tuple (should_update: bool, extracted_markdown_chunk: str, override_analysis: str)
    """
    google_api_key = os.getenv("GEMINI_API_KEY")
    if not google_api_key:
        return False, "", "GEMINI_API_KEY is not defined"

    # Use Gemini 1.5 Flash or higher
    try:
        llm = ChatGoogleGenerativeAI(
            model="gemini-1.5-flash",
            google_api_key=google_api_key,
            temperature=0.1
        )
    except Exception as e:
        return False, "", f"Failed to initialize ChatGoogleGenerativeAI: {str(e)}"

    chat_history_text = "\n".join([f"{m.get('role', 'user')}: {m.get('content', '')}" for m in messages[-4:]])
    
    reflector_prompt = f"""
    分析以下最近几轮的对话，识别用户是否对项目规则、TR计划、供应商状态、首选流程、审批规则等表达了“纠正/否定/更改/声明/新决定”。
    
    对话内容:
    {chat_history_text}
    
    当前服务器时间: {current_time_str}
    
    【判定准则】:
    - 如果用户只是在常规提问、陈述、表示认同或寒暄，不需要提炼长期记忆。返回 'NO_MEMORY_NEEDED'。
    - 如果用户明确指出“不对/弄错了/纠正一下...”、“以后都要采用...”、“更新项目状态...”，那么必须提炼这行事实，将其制作成新条目。
    
    【输出规则】:
    如果你断定有必须更新的长期记忆，请按照以下指示输出:
    你的输出必须分为两个部分，使用特殊的分隔符 '===PART_SEPARATOR===' 隔开。
    
    【第一部分：新记录 Markdown 快照】:
    必须且仅包含遵循以下格式的 Markdown 内容:
    ### [{current_time_str}] 记忆提取点标题 (简明扼要)
    - **触发表点**：[这里简明描述用户在此指出或订正了什么，如：用户纠正了TR4的物理跌落噪声测试规格]
    - **AI 提炼思考 (Thought Process)**：[详细记录为什么要记录这条记忆，它推导的过程、逻辑和修正背景是什么。如果新事实纠正了以往的事实，请在这里点明由于用户的纠偏，我们将先前的事实判定覆盖]
    - **沉淀事实 (Fact)**：[精炼成 1-2 句可全局引用的确凿规则/状态，例如：TR4物理噪声必须重复测试 5 次且平均值低于 45dB。]
    
    【第二部分：冲突去重与历史标记】:
    请详细陈述：这个新提取的事实与之前可能存在的任何规则是否冲突、是否覆盖了之前的某条规则？如果覆盖了，请写出 [CONFLICT_DETECTED] 并在下一行说明理由。如果没有冲突，请返回 [NO_CONFLICT]。
    """

    try:
        response = await llm.ainvoke(reflector_prompt)
        text = response.content.strip() if response.content else ""
        
        if "NO_MEMORY_NEEDED" in text or not text:
            return False, "", "No long term memory update needed decided by agent."

        parts = text.split("===PART_SEPARATOR===")
        extracted_chunk = parts[0].strip()
        override_analysis = parts[1].strip() if len(parts) > 1 else "[NO_CONFLICT]"
        
        return True, extracted_chunk, override_analysis
    except Exception as e:
        return False, "", f"LLM Invocation Failed: {str(e)}"


async def trigger_async_memory_reflection(messages: List[Dict[str, Any]]):
    """
    Asynchronously extracts, reconciles, and writes long-term reflections
    into MEMORY.md at root level. Ensures conflict detection is executed correctly.
    """
    now_str = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    now_date_str = datetime.datetime.now().strftime("%Y-%m-%d")

    # 1. Ask Gemini to analyze the session messages and get the reflection entry
    should_update, new_chunk, override_analysis = await reflect_long_term_memory(messages, now_str)
    
    if not should_update:
        # No update needed or error occurred, just run integrity validation once to ensure system starting fine
        verify_memory_integrity()
        return

    print(f"\033[94m[MEMORY REFLECTOR] 检测到潜在的记忆/偏好更新! 正在同步写入 MEMORY.md...\033[0m")

    # 2. Read current MEMORY.md content
    if os.path.exists(MEMORY_FILE_PATH):
        with open(MEMORY_FILE_PATH, "r", encoding="utf-8") as f:
            original_content = f.read()
    else:
        original_content = """# MEMORY.md 长期记忆
反射代理（Reflection Agent）自动提炼的核心偏好与项目事实。这些内容将优先注入对话上下文。

"""

    # 3. Handle Conflict & "Memory De-duplication and Overwrite" (记忆去重与覆盖)
    # Check if there's any conflict found by LLM or simple semantic search
    final_content = original_content
    
    if "[CONFLICT_DETECTED]" in override_analysis:
        print(f"\033[93m[MEMORY REFLECTOR] 检索到冲突覆盖! 正在对旧记忆条目打上覆盖注脚...\033[0m")
        # Let's run a smart reconciliation via Gemini to patch the MEMORY.md cleanly!
        google_api_key = os.getenv("GEMINI_API_KEY")
        if google_api_key:
            try:
                llm = ChatGoogleGenerativeAI(
                    model="gemini-1.5-flash",
                    google_api_key=google_api_key,
                    temperature=0.1
                )
                reconcile_prompt = f"""
                你是长期记忆合并模块。用户的意向/规则发生了由于新变动导致的冲突覆盖。
                
                现有的 MEMORY.md 内容:
                {original_content}
                
                新产生的记忆快照条目:
                {new_chunk}
                
                覆盖分析理由:
                {override_analysis}
                
                【核心重构任务】:
                1. 找到现有 MEMORY.md 中与之发生冲突的旧条目头部。在旧条目头部（即类似 '### [YYYY-MM-DD HH:mm:ss] 主题' 这一行的正下方，或者是同一行行尾），追加上 `[已于 {now_date_str} 被覆盖]` 标记。
                2. 切记：千万不能直接删除或擦除该旧条目！必须将其原样封存在历史中，仅仅打上覆盖标注。
                3. 将新产生的记忆条目追加在 MEMORY.md 的最末尾。
                4. 输出修改完成后的完整新 MEMORY.md 文件内容，保留文档首部的说明性文字，保证格式绝对规范无损。
                """
                reconciled_res = await llm.ainvoke(reconcile_prompt)
                if reconciled_res.content:
                    output_text = reconciled_res.content.strip()
                    # Clean up triple backticks if outputted
                    if "```markdown" in output_text:
                        output_text = output_text.split("```markdown")[1].split("```")[0].strip()
                    elif "```" in output_text:
                        output_text = output_text.split("```")[1].split("```")[0].strip()
                    
                    final_content = output_text
            except Exception as e:
                print(f"[MEMORY REFLECTOR] Error in smart reconciliation, adopting safe markdown appending fallback: {str(e)}")
                final_content = original_content + "\n\n" + new_chunk
    else:
        # Safely append if no conflict was declared
        final_content = original_content.rstrip() + "\n\n" + new_chunk + "\n"

    # Write back
    try:
        with open(MEMORY_FILE_PATH, "w", encoding="utf-8") as f:
            f.write(final_content)
        print(f"\033[92m[MEMORY REFLECTOR] MEMORY.md 更新完成。正在进行完整性自检...\033[0m")
    except Exception as e:
        print(f"\033[91m[MEMORY REFLECTOR] 写入 MEMORY.md 失败: {str(e)}\033[0m")

    # 4. Run checking immediately
    verify_memory_integrity()
