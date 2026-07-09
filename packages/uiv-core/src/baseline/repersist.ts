/**
 * re-persist 触发标记(T3.2 Step 4)。
 * uiv 零 magpie 依赖:pin 成功且有 scope 且探测到工作区 .magpie/ 时,写 .magpie/uiv-repersist.json 触发标记。
 * 消费点在 magpie 侧 T3.1b(execute.ts validateRequirementContract 之前),此处只写不消费。
 */
export function requestContractRepersist(_root: string): boolean { return false; }
