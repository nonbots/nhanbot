import { parseMessage } from "./parse/index.js";

export class CommandManager {
  commands = {};

  constructor() {
    this.parsedMessage;
  }

  addCommand(name, cb) {
    this.commands[name] = cb;
  }

  onMessage(message) {
    console.log(" WHAT IS MESSAGE TEST ", message);

    if (message.type === "utf8") {
      let rawIrcMessage = message.utf8Data.trimEnd();
      console.log(
        `Message received (${new Date().toISOString()}): '${rawIrcMessage}'\n`
      );

      let messages = rawIrcMessage.split("\r\n"); // The IRC message may contain one or more messages.
      messages.forEach((message) => {
        this.parsedMessage = parseMessage(message);
        console.log("PARSED MESSAGE", this.parsedMessage);
        if (this.parsedMessage) {

          // console.log(`Message command: ${parsedMessage.command.command}`);
          // console.log(`\n${JSON.stringify(parsedMessage, null, 3)}`)

          switch (this.parsedMessage.command.command) {
            case "PRIVMSG":
              if (
                this.commands[this.parsedMessage.command.botCommand] !== undefined
              ) {
                this.commands[this.parsedMessage.command.botCommand](this.parsedMessage);
              }
          }
        }
      });
    }
  }
}
