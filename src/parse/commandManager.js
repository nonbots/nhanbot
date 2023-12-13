class CommandManager {
  commands = {};

  constructor() {}

  addCommand(name, cb) {
    this.commands[name] = cb;
  }

  onMessage(message) {
    if (message.type === "utf8") {
      let rawIrcMessage = message.utf8Data.trimEnd();
      console.log(
        `Message received (${new Date().toISOString()}): '${rawIrcMessage}'\n`
      );

      let messages = rawIrcMessage.split("\r\n"); // The IRC message may contain one or more messages.
      messages.forEach((message) => {
        let parsedMessage = parseMessage(message);

        if (parsedMessage) {
          // console.log(`Message command: ${parsedMessage.command.command}`);
          // console.log(`\n${JSON.stringify(parsedMessage, null, 3)}`)

          switch (parsedMessage.command.command) {
            case "PRIVMSG":
              if (
                this.command[parsedMessage.command.botCommand] !== undefined
              ) {
                this.command[parsedMessage.command.botCommand](parsedMessage);
              }
          }
        }
      });
    }
  }
}

let commandManager = new CommandManager();
console.log(commandManager);
connection.on("message", commandManager.onMessage);

commandManager.addCommand("ping", (message) => {
  connection.sendUTF(`PRIVMSG ${message.command.channel} : pong`);
});
