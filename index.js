import 'dotenv/config';
import OpenAI from 'openai';
import { exec } from 'child_process';
import chalk from 'chalk';
import ora from 'ora';
import boxen from 'boxen';
import { highlight } from 'cli-highlight';

const openai = new OpenAI({
  apiKey: process.env.NVIDIA_API_KEY,
  baseURL: 'https://integrate.api.nvidia.com/v1',
});



function getWeatherInfo(city) {
  return `28 DEGREE CELSIUS for ${city}`;
}

function executeCommand(command) {
  return new Promise((resolve, reject) => {
    exec(command, { maxBuffer: 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) return reject(error);
      resolve(`stdout ${stdout}\nstderr ${stderr}`);
    });
  });
}



const tools = [
  {
    name: "getWeatherInfo",
    description: "Get the weather information for a city",
    parameters: {
      type: "object",
      properties: {
        city: { type: "string", description: "The city to get the weather information for" },
      },
      required: ["city"],
    },
  },
  {
    name: "executeCommand",
    description: "Execute a command",
    parameters: {
      type: "object",
      properties: {
        command: { type: "string", description: "The command to execute" },
      },
      required: ["command"],
    },
  },
];

const availableFunctions = {
  getWeatherInfo,
  executeCommand,
};



const SYSTEM_PROMPT = `You are an AI assistant that resolves user queries using tools. Be direct and efficient.

You respond in JSON with one of two step types: ACTION or OUTPUT.
- ACTION: Call a tool. Think internally first, then immediately output the action.
- OUTPUT: Give the final answer to the user.

Do NOT output THINK steps. Think internally, then respond with ACTION or OUTPUT only.
After each ACTION, you will receive an OBSERVE message with the tool result. Use it to decide your next ACTION or final OUTPUT.

Available tools:
- getWeatherInfo(city: string): Returns weather info for a city.
- executeCommand(command: string): Executes a shell command on macOS and returns stdout/stderr. Use URL-friendly names for files/folders (no spaces). Combine multiple commands with && when possible.

JSON format for ACTION:
{ "step": "ACTION", "tool": "<tool_name>", "tool_input": "<input>", "content": "<brief description>" }

JSON format for OUTPUT:
{ "step": "OUTPUT", "content": "<final answer>" }

Rules:
- Output strictly valid JSON, one step per response.
- Only use the tools listed above.
- For executeCommand: prefer combining related commands with && to minimize round-trips.
- Always respond with ACTION or OUTPUT, never THINK.`;



const MAX_ITERATIONS = 25;
const RESULT_PREVIEW_LEN = 300;

function printBanner() {
  const banner = chalk.bold.cyanBright('⚡ Agentic Coding Tool');
  console.log(
    boxen(banner, {
      padding: 1,
      margin: { top: 1, bottom: 0, left: 0, right: 0 },
      borderStyle: 'double',
      borderColor: 'cyan',
    })
  );
}

function printQuery(query) {
  console.log(
    boxen(chalk.white(query), {
      title: chalk.bold.yellowBright('📝 User Query'),
      padding: 1,
      margin: { top: 1, bottom: 1, left: 0, right: 0 },
      borderStyle: 'round',
      borderColor: 'yellow',
    })
  );
}

function printStepHeader(num) {
  console.log(
    chalk.dim('─'.repeat(50)) +
    chalk.bgMagenta.white.bold(` STEP ${num} `) +
    chalk.dim('─'.repeat(50))
  );
}

function printAction(description, tool, input) {
  console.log(chalk.bold.blueBright(`  🔧 ${description}`));
  console.log(chalk.gray(`     Tool: `) + chalk.cyan(tool));


  if (tool === 'executeCommand') {
    try {
      const highlighted = highlight(input, { language: 'bash', ignoreIllegals: true });
      console.log(chalk.gray(`     Cmd:  `) + highlighted);
    } catch {
      console.log(chalk.gray(`     Cmd:  `) + chalk.white(input));
    }
  } else {
    console.log(chalk.gray(`     Input: `) + chalk.white(input));
  }
}

function printResult(result) {
  const preview = result.length > RESULT_PREVIEW_LEN
    ? result.substring(0, RESULT_PREVIEW_LEN) + chalk.dim('...')
    : result;

  console.log(
    boxen(chalk.greenBright(preview), {
      title: chalk.bold.green('✅ Result'),
      padding: { top: 0, bottom: 0, left: 1, right: 1 },
      margin: { top: 0, bottom: 1, left: 4, right: 0 },
      borderStyle: 'round',
      borderColor: 'green',
      dimBorder: true,
    })
  );
}

function printError(errMsg) {
  const preview = errMsg.length > RESULT_PREVIEW_LEN
    ? errMsg.substring(0, RESULT_PREVIEW_LEN) + chalk.dim('...')
    : errMsg;

  console.log(
    boxen(chalk.redBright(preview), {
      title: chalk.bold.red('❌ Error'),
      padding: { top: 0, bottom: 0, left: 1, right: 1 },
      margin: { top: 0, bottom: 1, left: 4, right: 0 },
      borderStyle: 'round',
      borderColor: 'red',
      dimBorder: true,
    })
  );
}

function printFinalAnswer(content) {
  console.log(
    boxen(chalk.white(content), {
      title: chalk.bold.greenBright('✅ Final Answer'),
      padding: 1,
      margin: { top: 1, bottom: 1, left: 0, right: 0 },
      borderStyle: 'double',
      borderColor: 'green',
    })
  );
}



async function main() {
  printBanner();

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
  ];

  const userquery = "create 10 files in a new folder called faltu files. name them 1-10";
  printQuery(userquery);
  messages.push({ role: "user", content: userquery });

  let iterations = 0;

  while (iterations < MAX_ITERATIONS) {
    iterations++;
    printStepHeader(iterations);


    const thinkSpinner = ora({
      text: chalk.magentaBright('Thinking...'),
      spinner: 'dots12',
      color: 'magenta',
    }).start();

    const response = await openai.chat.completions.create({
      model: "qwen/qwen3-coder-480b-a35b-instruct",
      response_format: { type: "json_object" },
      messages: messages,
      temperature: 0.7,
      max_tokens: 4096,
    });

    const raw = response.choices[0].message.content;
    messages.push({ role: "assistant", content: raw });

    let parsed;
    try {
      parsed = JSON.parse(raw);
      thinkSpinner.succeed(chalk.magentaBright('Got response'));
    } catch (e) {
      thinkSpinner.fail(chalk.red('Failed to parse AI response'));
      console.log(chalk.dim(raw));
      break;
    }


    if (parsed.step === "OUTPUT") {
      printFinalAnswer(parsed.content);
      break;
    }


    if (parsed.step === "ACTION") {
      const tool = parsed.tool;
      const input = parsed.tool_input;
      printAction(parsed.content, tool, input);

      const execSpinner = ora({
        text: chalk.yellowBright(`Running ${tool}...`),
        spinner: 'bouncingBar',
        color: 'yellow',
      }).start();

      try {
        const result = await availableFunctions[tool](input);
        execSpinner.succeed(chalk.yellow(`${tool} completed`));
        printResult(result);

        messages.push({
          role: "user",
          content: JSON.stringify({ step: "OBSERVE", content: result }),
        });
      } catch (err) {
        const errMsg = err.message || String(err);
        execSpinner.fail(chalk.red(`${tool} failed`));
        printError(errMsg);

        messages.push({
          role: "user",
          content: JSON.stringify({ step: "OBSERVE", content: `Error: ${errMsg}` }),
        });
      }
      continue;
    }


    if (parsed.step === "THINK") {
      console.log(chalk.dim.italic(`  💭 ${parsed.content}`));
      continue;
    }

    console.log(chalk.yellow(`  ⚠️ Unknown step: ${parsed.step}`), chalk.dim(parsed.content));
  }

  if (iterations >= MAX_ITERATIONS) {
    console.log(
      boxen(chalk.yellowBright(`Reached max iterations (${MAX_ITERATIONS}). Stopping.`), {
        title: chalk.bold.yellow('⚠️ Limit Reached'),
        padding: 1,
        borderStyle: 'round',
        borderColor: 'yellow',
      })
    );
  }
}

main();
