import 'dotenv/config';
import OpenAI from 'openai';
import { exec } from 'child_process';

const openai = new OpenAI({
  apiKey: process.env.NVIDIA_API_KEY,
  baseURL: 'https://integrate.api.nvidia.com/v1',
})

function getWeatherInfo(city){
  return `28 DEGREE CELSIUS for ${city}`
}

function executeCommand(command){
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        return reject(error)
      }  
      resolve(`stdout ${stdout}\nstderr ${stderr}`)
    } )
  })
}

const tools = [
  {
    name: "getWeatherInfo",
    description: "Get the weather information for a city",
    parameters: {
      type: "object",
      properties: {
        city: {
          type: "string",
          description: "The city to get the weather information for",
        },
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
        command: {
          type: "string",
          description: "The command to execute",
        },
      },
      required: ["command"],
    },
  }
]

const availableFunctions = {
  getWeatherInfo: getWeatherInfo,
  executeCommand: executeCommand,
}

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
- Always respond with ACTION or OUTPUT, never THINK.`


const MAX_ITERATIONS = 25;

async function main() {
  const messages = [
    { role: "system", content: SYSTEM_PROMPT }
  ];

  const userquery = "replace the api key in index.js for me";
  console.log(`\n🚀 User Query: ${userquery}\n`);
  messages.push({ role: "user", content: userquery });

  let iterations = 0;

  while (iterations < MAX_ITERATIONS) {
    iterations++;
    console.log(`--- Step ${iterations} ---`);

    const response = await openai.chat.completions.create({
      model: "qwen/qwen3-coder-480b-a35b-instruct",
      response_format: { type: "json_object" },
      messages: messages,
      temperature: 0.6,
      max_tokens: 2048,
    });

    const raw = response.choices[0].message.content;
    messages.push({ role: "assistant", content: raw });

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      console.error("❌ Failed to parse JSON:", raw);
      break;
    }

    if (parsed.step === "OUTPUT") {
      console.log(`\n✅ Final Answer:\n${parsed.content}`);
      break;
    }

    if (parsed.step === "ACTION") {
      const tool = parsed.tool;
      const input = parsed.tool_input;
      console.log(`🔧 Action: ${parsed.content}`);
      console.log(`   Tool: ${tool} | Input: ${input}`);

      try {
        const result = await availableFunctions[tool](input);
        console.log(`   ✅ Result: ${result.substring(0, 200)}${result.length > 200 ? '...' : ''}`);

        messages.push({
          role: "user",
          content: JSON.stringify({ step: "OBSERVE", content: result })
        });
      } catch (err) {
        const errMsg = err.message || String(err);
        console.log(`   ❌ Error: ${errMsg.substring(0, 200)}`);

        messages.push({
          role: "user",
          content: JSON.stringify({ step: "OBSERVE", content: `Error: ${errMsg}` })
        });
      }
      continue;
    }

    // If model still outputs a THINK step, just log it and keep going without adding another message
    if (parsed.step === "THINK") {
      console.log(`💭 ${parsed.content}`);
      continue;
    }

    console.log("⚠️ Unknown step:", parsed.step, parsed.content);
  }

  if (iterations >= MAX_ITERATIONS) {
    console.log(`\n⚠️ Reached max iterations (${MAX_ITERATIONS}). Stopping.`);
  }
}

main();
