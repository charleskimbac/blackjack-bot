import { GoogleGenAI, createUserContent, createPartFromUri } from '@google/genai';
import { config } from 'dotenv';
config();

(async () => {
    console.log(`getting card values...`);

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    
    const uploadedImage = await ai.files.upload({
        file: `images/current/cardValues.png`,
        config: { mimeType: "image/png" },
    });

    const result = await ai.models.generateContent({
        model: "gemini-2.0-flash-001",
        config: {
            temperature: 0
        },
        contents: createUserContent([
            createPartFromUri(uploadedImage.uri, uploadedImage.mimeType),
            "\n\n", `
            In the image, we are in a blackjack hand. There are two sets of playing cards. 
            The set at the top is the dealer hand (one card) and the set at the bottom is the player's hand; they are separated by blue.
            At the bottom right of the image and on the bottom set, there is a white number inside a black circle; this is the value of the player's hand.
            Note that this number also takes into account if the player has Aces (which has a value of 1 or 11). 
            For example, the number may say '10/20'; this means the player has an Ace and other cards summing to 9.

            Respond with only one thing: a number array, with the numbers in the bottom set first, and the number in the top set last.
            For example let us have the array [2, 1, 10, 4]. This means the bottom set is 2, 1, and 10, and the top set is 4.
            In this array, let face cards (denoted by J, Q, K) be 10 and Aces (denoted by A) be 1.

            General examples: 
            You see 'A' in the top set, '2 Q 10' in the bottom set, and '21' as the white number; respond with only: [2, 10, 10, 1]
            You see '9' in the top set, 'A 7' in the bottom set, and '8/18' as the white number; respond with only: [1, 7, 9]
            You see '10' in the top set, '2 3 A' in the bottom set, and '6/16' as the white number; respond with only: [2, 3, 1, 10]

            There are no card of '0', check if it is actually a 'Q' (as they look similar) and replace as necessary.
            Examples:
            You see '7' in the top set, '0 3' in the bottom set, and '13' as the white number; respond with only: [10, 3, 7]
            You see '0' in the top set, 'K 2 2' in the bottom set, and '14' as the white number; respond with only: [10, 2, 2, 10]

            Get the sum of the bottom set. Get the white number. Do these two numbers equal each other?
            If they do, great. If they do not, return the number array, white number, as well as "ERROR!", as shown below.
            Examples:
            You see '2' in the top set, 'Q 3 3' in the bottom set, and '7' as the white number; respond with only: [10, 3, 1, 2] 7 ERROR!
            The bottom set has a sum of 16, but the white number is 7. They do not equal. We return the error message.
            You see '7' in the top set, '5 A 2' in the bottom set, and '9/19' as the white number; respond with only: [5, 1, 2, 7] 9/19 ERROR!
            The bottom set has a sum of 8/18 (since A can be 1 or 11), but the white number is 9/19. They do not equal. We return the error message.
            `,
        ]),
    });

    console.log("raw response:");
    console.log(result.text);
})();