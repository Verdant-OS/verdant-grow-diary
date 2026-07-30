function commandWithFiles(command, files) {
  const argumentsList = files.map((file) => JSON.stringify(file.replaceAll("\\", "/"))).join(" ");
  return argumentsList ? `${command} ${argumentsList}` : command;
}

export default {
  "*.{ts,tsx}": (files) => [
    commandWithFiles("prettier --write", files),
    commandWithFiles("eslint --fix", files),
    "tsc -p tsconfig.app.json --noEmit --skipLibCheck",
  ],
  "*.{js,jsx,mjs,cjs,json,css,md,html,yml,yaml}": (files) => [
    commandWithFiles("prettier --write", files),
  ],
};
