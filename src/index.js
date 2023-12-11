#!/usr/bin/env node

const parseCommand = require('./parseCommand.js');
const WebSocketClient = require('websocket').client;

const client = new WebSocketClient();
const channel = 'nhancodes';  // Replace with your channel.
const account = 'nhanbot';   // Replace with the account the bot runs as
const password = 'oauth:<your access token goes here>';

const moveMessage = 'Get up and move, your body will thank you!';
const defaultMoveInterval = 1000 * 60 * 1; // Set to 1 minute for testing.
let moveInterval = defaultMoveInterval;

client.on('connectFailed', function(error) {
    console.log('Connect Error: ' + error.toString());
});

client.on('connect', function(connection) {
    console.log('WebSocket Client Connected');

    // This is a simple bot that doesn't need the additional
    // Twitch IRC capabilities.

    // connection.sendUTF('CAP REQ :twitch.tv/commands twitch.tv/membership twitch.tv/tags');
    
    // Authenticate with the Twitch IRC server and then join the channel.
    // If the authentication fails, the server drops the connection.

    connection.sendUTF(`PASS ${password}`); 
    connection.sendUTF(`NICK ${account}`);

    // Set a timer to post future 'move' messages. This timer can be
    // reset if the user passes, !move [minutes], in chat.
    let intervalObj = setInterval(() => {
        connection.sendUTF(`PRIVMSG ${channel} :${moveMessage}`);
    }, moveInterval);
    
    connection.on('error', function(error) {
        console.log("Connection Error: " + error.toString());
    });

    connection.on('close', function() {
        console.log('Connection Closed');
        console.log(`close description: ${connection.closeDescription}`);
        console.log(`close reason code: ${connection.closeReasonCode}`);

        clearInterval(intervalObj);
    });

    // Process the Twitch IRC message.

    connection.on('message', function(ircMessage) {
        if (ircMessage.type === 'utf8') {
            let rawIrcMessage = ircMessage.utf8Data.trimEnd();
            console.log(`Message received (${new Date().toISOString()}): '${rawIrcMessage}'\n`);

            let messages = rawIrcMessage.split('\r\n');  // The IRC message may contain one or more messages.
            messages.forEach(message => {
                let parsedMessage = parseMessage(message); // parse the messages into different components {  // Contains the component parts.
                /*
                tags: null,
                source: null, // returns source {} 
                command: null, // {command: JOIN, channel: #bar}
                parameters: null
            };*/
            
                if (parsedMessage) {
                    // console.log(`Message command: ${parsedMessage.command.command}`);
                    // console.log(`\n${JSON.stringify(parsedMessage, null, 3)}`)

                    switch (parsedMessage.command.command) {
                        case 'PRIVMSG':
                            // Ignore all messages except the '!move' bot
                            // command. A user can post a !move command to change the 
                            // interval for when the bot posts its move message.

                            if ('move' === parsedMessage.command.botCommand) {
                                
                                // Assumes the command's parameter is well formed (e.g., !move 15).

                                let updateInterval = (parsedMessage.command.botCommandParams) ?
                                    parseInt(parsedMessage.command.botCommandParams) * 1000 * 60 : defaultMoveInterval;

                                if (moveInterval != updateInterval) {
                                    // Valid range: 1 minute to 60 minutes
                                    if (updateInterval >= 60000 && updateInterval <= 3600000) {  
                                        moveInterval = updateInterval;

                                        // Reset the timer.
                                        clearInterval(intervalObj);
                                        intervalObj = null;
                                        intervalObj = setInterval(() => {
                                            connection.sendUTF(`PRIVMSG ${channel} :${moveMessage}`);
                                        }, moveInterval);
                                    }
                                }
                            }
                            else if ('moveoff' === parsedMessage.command.botCommand) {
                                clearInterval(intervalObj);
                                connection.sendUTF(`PART ${channel}`);
                                connection.close();
                            }
                            
                            break;
                        case 'PING':
                            connection.sendUTF('PONG ' + parsedMessage.parameters);
                            break;
                        case '001':
                            // Successfully logged in, so join the channel.
                            connection.sendUTF(`JOIN ${channel}`); 
                            break; 
                        case 'JOIN':
                            // Send the initial move message. All other move messages are
                            // sent by the timer.
                            connection.sendUTF(`PRIVMSG ${channel} :${moveMessage}`);
                            break;
                        case 'PART':
                            console.log('The channel must have banned (/ban) the bot.');
                            connection.close();
                            break;
                        case 'NOTICE': 
                            // If the authentication failed, leave the channel.
                            // The server will close the connection.
                            if ('Login authentication failed' === parsedMessage.parameters) {
                                console.log(`Authentication failed; left ${channel}`);
                                connection.sendUTF(`PART ${channel}`);
                            }
                            else if ('You don’t have permission to perform that action' === parsedMessage.parameters) {
                                console.log(`No permission. Check if the access token is still valid. Left ${channel}`);
                                connection.sendUTF(`PART ${channel}`);
                            }
                            break;
                        default:
                            ; // Ignore all other IRC messages.
                    }
                }
            });
        }
    });
    
});

client.connect('ws://irc-ws.chat.twitch.tv:80');


// Parses an IRC message and returns a JSON object with the message's 
// component parts (tags, source (nick and host), command, parameters). 
// Expects the caller to pass a single message. (Remember, the Twitch 
// IRC server may send one or more IRC messages in a single message.)

function parseMessage(message) {

    let parsedMessage = {  // Contains the component parts.
        tags: null,
        source: null, // returns source {} 
        command: null, // {command: JOIN, channel: #bar}
        parameters: null
    };

    // The start index. Increments as we parse the IRC message.

    let idx = 0; 

    // The raw components of the IRC message.

    let rawTagsComponent = null;
    let rawSourceComponent = null;  //[foo!foo@foo.tmi.twitch.tv, JOIN #bar]
    let rawCommandComponent = null;
    let rawParametersComponent = null;

    // If the message includes tags, get the tags component of the IRC message.

    if (message[idx] === '@') {  // The message includes tags. :foo!foo@foo.tmi.twitch.tv JOIN #bar\r\n
        let endIdx = message.indexOf(' ');
        rawTagsComponent = message.slice(1, endIdx);
        idx = endIdx + 1; // Should now point to source colon (:).
    }

    // Get the source component (nick and host) of the IRC message.
    // The idx should point to the source part; otherwise, it's a PING command.

    if (message[idx] === ':') {  //:foo!foo@foo.tmi.twitch.tv JOIN #bar\r\n
        idx += 1;
        let endIdx = message.indexOf(' ', idx);
        rawSourceComponent = message.slice(idx, endIdx); //[foo!foo@foo.tmi.twitch.tv, JOIN #bar]
        idx = endIdx + 1;  // Should point to the command part of the message.
    }

    // Get the command component of the IRC message.
                                            //JOIN #bar
    let endIdx = message.indexOf(':', idx);  // Looking for the parameters part of the message.
    if (-1 == endIdx) {                      // But not all messages include the parameters part.
        endIdx = message.length;                 
    }

    rawCommandComponent = message.slice(idx, endIdx).trim(); //JOIN #bar

    // Get the parameters component of the IRC message.

    if (endIdx != message.length) {  // Check if the IRC message contains a parameters component.
        idx = endIdx + 1;            // Should point to the parameters part of the message.
        rawParametersComponent = message.slice(idx);
    }

    // Parse the command component of the IRC message.

    parsedMessage.command = parseCommand(rawCommandComponent); //JOIN #bar // {command: JOIN, channel: #bar} assigned to parsedMessage commmand property

    // Only parse the rest of the components if it's a command
    // we care about; we ignore some messages.

    if (null == parsedMessage.command) {  // Is null if it's a message we don't care about.
        return null; 
    }
    else {
        if (null != rawTagsComponent) {  // The IRC message contains tags.
            parsedMessage.tags = parseTags(rawTagsComponent);
        }

        parsedMessage.source = parseSource(rawSourceComponent);

        parsedMessage.parameters = rawParametersComponent;
        if (rawParametersComponent && rawParametersComponent[0] === '!') {  
            // The user entered a bot command in the chat window.            
            parsedMessage.command = parseParameters(rawParametersComponent, parsedMessage.command);
        }
    }

    return parsedMessage;
}

// Parses the tags component of the IRC message.

function parseTags(tags) {
    // badge-info=;badges=broadcaster/1;color=#0000FF;...

    const tagsToIgnore = {  // List of tags to ignore.
        'client-nonce': null,
        'flags': null
    };

    let dictParsedTags = {};  // Holds the parsed list of tags.
                              // The key is the tag's name (e.g., color).
    let parsedTags = tags.split(';'); 

    parsedTags.forEach(tag => {
        let parsedTag = tag.split('=');  // Tags are key/value pairs.
        let tagValue = (parsedTag[1] === '') ? null : parsedTag[1];

        switch (parsedTag[0]) {  // Switch on tag name
            case 'badges':
            case 'badge-info':
                // badges=staff/1,broadcaster/1,turbo/1;

                if (tagValue) {
                    let dict = {};  // Holds the list of badge objects.
                                    // The key is the badge's name (e.g., subscriber).
                    let badges = tagValue.split(','); 
                    badges.forEach(pair => {
                        let badgeParts = pair.split('/');
                        dict[badgeParts[0]] = badgeParts[1];
                    })
                    dictParsedTags[parsedTag[0]] = dict;
                }
                else {
                    dictParsedTags[parsedTag[0]] = null;
                }
                break;
            case 'emotes':
                // emotes=25:0-4,12-16/1902:6-10

                if (tagValue) {
                    let dictEmotes = {};  // Holds a list of emote objects.
                                          // The key is the emote's ID.
                    let emotes = tagValue.split('/');
                    emotes.forEach(emote => {
                        let emoteParts = emote.split(':');

                        let textPositions = [];  // The list of position objects that identify
                                                 // the location of the emote in the chat message.
                        let positions = emoteParts[1].split(',');
                        positions.forEach(position => {
                            let positionParts = position.split('-');
                            textPositions.push({
                                startPosition: positionParts[0],
                                endPosition: positionParts[1]    
                            })
                        });

                        dictEmotes[emoteParts[0]] = textPositions;
                    })

                    dictParsedTags[parsedTag[0]] = dictEmotes;
                }
                else {
                    dictParsedTags[parsedTag[0]] = null;
                }

                break;
            case 'emote-sets':
                // emote-sets=0,33,50,237

                let emoteSetIds = tagValue.split(',');  // Array of emote set IDs.
                dictParsedTags[parsedTag[0]] = emoteSetIds;
                break;
            default:
                // If the tag is in the list of tags to ignore, ignore
                // it; otherwise, add it.

                if (tagsToIgnore.hasOwnProperty(parsedTag[0])) { 
                    ;
                }
                else {
                    dictParsedTags[parsedTag[0]] = tagValue;
                }
        } 
    });

    return dictParsedTags;
}

