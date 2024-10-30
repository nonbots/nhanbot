import { parseMessage } from "./parse/index.js";

export class CommandManager {
  commands = {};

 /* constructor() {
    this.parsedMessage;
  }
 */ 
  addCommand(name, cb) {
    this.commands[name] = cb;
  }

  onMessage(message) {
    if (message.type === "utf8") {
      let rawIrcMessage = message.utf8Data.trimEnd();
      /*console.log(
        `Message received (${new Date().toISOString()}): '${rawIrcMessage}'\n`
      );
      */
      let messages = rawIrcMessage.split("\r\n"); // The IRC message may contain one or more messages.
      messages.forEach((message) => {
        const parsedMessage = parseMessage(message);
        //console.log("PARSED MESSAGE", this.parsedMessage);
        if (parsedMessage) {
          switch (parsedMessage.command.command) {
            case "PRIVMSG":
              if (
                this.commands[parsedMessage.command.botCommand] !== undefined
              ) {
                this.commands[parsedMessage.command.botCommand](parsedMessage);
              }
          }
        }
      });
    }
  }
}
