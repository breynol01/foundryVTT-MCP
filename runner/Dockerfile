FROM node:20-slim

RUN npm i -g @openai/codex @anthropic-ai/claude-code

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY src ./src

ENV PORT=8787
EXPOSE 8787

CMD ["node", "src/index.js"]
