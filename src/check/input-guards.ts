export function isInstructionAttack(text: string): boolean {
  const value = text.normalize('NFKC');
  return /<(?:system|developer)>|\bSYSTEM\s*:/iu.test(value)
    || /\b(?:ignore|override|disregard|replace|skip|bypass)\b[\s\S]{0,100}\b(?:rules|instructions|policies|sources|evidence|checking|checker)\b/iu.test(value)
    || /\b(?:reveal|print|expose)\b[\s\S]{0,70}\b(?:secret|credentials|api\s*key)\b/iu.test(value)
    || /\b(?:invent|make up|force)\b[\s\S]{0,90}\b(?:quote|source|verdict)\b/iu.test(value)
    || /\b(?:return|output|say|mark)\b[\s\S]{0,40}(?:["']verdict["']\s*:|\b(?:NOT\s+)?REAL\b)[\s\S]{0,80}\b(?:without|instead|skip|obey)\b/iu.test(value);
}

export function needsSensitiveReview(text: string): boolean {
  return /\b(?:cures?|treatments?|dosage|diagnos\w*|medical|vaccin\w*|election\w*|ballot\w*|fraud|stole|criminal|scam|investment advice)\b/iu.test(text);
}
