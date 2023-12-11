1. Create a new application on the Twitch developer console to obtain the client ID and client Secret.
2. connect to the Twitch IRC server 
 3. request to use Twitch's optional capbilities
4. Authenticate your bot with the Twitch IRC server:
   The application on the bot initiates an authorization request by initiating an authentication process by redirecting the user to the twitch authorization server by having the user login with twitch. This authorize your application to access certian information. The server issues an authorization code to your applicaton. Your application sends a request to Twitch authentication with the authorization code and the gets the access token from Twitch authentication// let my chatbot have access to my chat via granting an access token. Now it can listen to messages sent and recieved from my chat. IRC provide a realtime connection so it will be able to listen to my chat at all times. 

Goal: to create a letterboard dislay top 5 of regulars 
Regulars are determined by: the total number of times that the viewer has sent a message on my chat. Get the top 5 in the list of viewers. 

Data: 
1.create an  object of all the viewers and their total messages sent. And sort the total number of messages in descending order to get the top 5. The sort might slow down the program.

Application logic 

2. The bot will listen to messages on my chat. 
3. It will grab the current message sent in my chat 
4. It will check for the user name of the message; if that user name exist in the viewers object 
        increment the value of the viewer in the object by 1 

        IGNORE 
        - iterate from the index position of viewer
        check to see if the viewers above it has a greater total 
            - swap the viewers 
        
        5. convert the object to an array of subarrays and sort the subarrays by the second element from high to low

    else 
        create the viewer at key and set the value to 1 


6. return the keys which will be an array of the viewers in descending order. 

7. Create a HMTL file that renders the viewers object in a list. 

Project structure: 

index.js ()
regularsBoard.html ( renders the array of top five viewers)
