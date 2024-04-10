export function isSentByStreamer(message) {
  return `#${message.source.nick}` === message.command.channel;
}
