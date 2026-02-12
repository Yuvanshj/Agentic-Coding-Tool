import readline from 'readline';
import chalk from 'chalk';
import boxen from 'boxen';
import main from './index.js';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(prompt) {
  return new Promise((resolve) => rl.question(prompt, resolve));
}

console.log(
  boxen(chalk.bold.cyanBright('⚡ Agentic Coding Tool'), {
    padding: 1,
    margin: { top: 1, bottom: 1, left: 0, right: 0 },
    borderStyle: 'double',
    borderColor: 'cyan',
  })
);

async function loop() {
  while (true) {
    const query = await ask(chalk.yellowBright('📝 Enter your prompt (or "exit" to quit): '));

    if (query.trim().toLowerCase() === 'exit') {
      console.log(chalk.cyan('\n👋 Goodbye!\n'));
      rl.close();
      break;
    }

    if (!query.trim()) continue;

    await main(query);
  }
}

loop();