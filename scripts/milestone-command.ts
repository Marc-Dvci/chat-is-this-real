const commands: Readonly<Record<string, string>> = {
  'setup:twitch': 'M1: Twitch account authorization',
  'probe:twitch': 'M1: live Twitch probe',
  'probe:models': 'M2: live Model Studio probe',
  eval: 'M3: locked ground truth, then M5 and M6: evaluation runners',
  companion: 'M6: audio companion',
  demo: 'M10: replay of recorded checks and stream memory'
};

const command = process.argv[2] ?? '';
console.error(`${command || 'Command'} requires ${commands[command] ?? 'a supported milestone command'}. Follow ../02_BUILD_PLAN.md.`);
process.exitCode = 1;
