/**
 * T4.2:provider 形态注入点(设计文档 2.7)。真实 anthropic/openai/gemini 后端不在本章
 * (B3,pending_followups 既有条目),仅接口 + fake 单测。judge 返回 unknown,一律经 attachL3Verdicts 过滤校验。
 * 默认不注入 = uiv 进程零 LLM 调用(轻量形态)。
 */
import type { L3InputPack } from './inputPack.js';

export interface VlmProvider { judge(pack: L3InputPack): Promise<unknown> }
