import { test, Page } from '@playwright/test';
import * as fs from 'fs/promises';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import { GoogleGenAI, createUserContent, createPartFromUri } from '@google/genai';
import * as path from 'path';
const BJ_STRATEGY = require("blackjack-strategy");
import { config } from 'dotenv';
config();

test('main', async ({ page: _page }) => {
    page = _page;
    await main();
});

const BJ_OPTIONS = {
    hitSoft17: true,             // Does dealer hit soft 17
    surrender: "none",           // Surrender offered - none, late, or early
    double: "any",               // Double rules - none, 10or11, 9or10or11, any
    doubleRange: [0,21],         // Range of values you can double, 
                                // if set supercedes double (v1.1 or higher)
    doubleAfterSplit: true,      // Can double after split
    resplitAces: false,          // Can you resplit aces
    offerInsurance: false,        // Is insurance offered
    numberOfDecks: 6,            // Number of decks in play
    maxSplitHands: 0,            // Max number of hands you can have due to splits
    count: {                    // Structure defining the count (v1.3 or higher)
        system: null,           // The count system - only "HiLo" is supported
        trueCount: null         // The TrueCount (count / number of decks left)
    },                          
    strategyComplexity: "bjc-great" // easy (v1.2 or higher), simple, advanced,
                                // exactComposition, bjc-supereasy (v1.4 or higher),
                                // bjc-simple (v1.4 or higher), or bjc-great
                                // (v1.4 or higher) - see below for details
};

const SCREENSHOT_INFO = {
    fullscreen: { 
        name: "fullscreen",
        clipRegion: {
            x: 0,
            y: 0,
            width: 1920,
            height: 1080,
        },
        maxPixelDiffAllowed: 0
    },
    lobbyScreen: { 
        name: "lobbyScreen",
        clipRegion: {
            x: 352,
            y: 99,
            width: 579,
            height: 407,
        },
        maxPixelDiffAllowed: 0
    },
    playScreen: { 
        name: "playScreen",
        clipRegion: {
            x: 500,
            y: 130,
            width: 285,
            height: 390,
        },
        maxPixelDiffAllowed: 0
    },
    cardValues: {
        name: "cardValues",
        clipRegion: {
            x: 425,
            y: 40,
            width: 230,
            height: 336,
        },
        maxPixelDiffAllowed: 0
    },
    insurance: {
        name: "insurance",
        clipRegion: {
            x: 400,
            y: 115,
            width: 480,
            height: 140,
        },
        maxPixelDiffAllowed: 0
    },
    loss: {
        name: "loss",
        clipRegion: {
            x: 615,
            y: 565,
            width: 48,
            height: 13,
        },
        maxPixelDiffAllowed: 0
    }, 
    win: {
        name: "win",
        clipRegion: {
            x: 635,
            y: 565,
            width: 14,
            height: 6,
        },
        maxPixelDiffAllowed: 0
    },
    playerActions: { // this is only "stand" text; double/sur can be disabled and icons can shift if theyre being hovered
        name: "playerActions",
        clipRegion: {
            x: 1146,
            y: 507,
            width: 58,
            height: 24,
        },
        maxPixelDiffAllowed: 0
    },
    player21icon: {
        name: "player21icon",
        clipRegion: {
            x: 622,
            y: 530,
            width: 36,
            height: 33,
        },
        maxPixelDiffAllowed: 0
    },
    dealerIcon: { // the way we use this (*only* before any player actions, after deal), we use it to check if a BJ is present; 
                  // we use a subset so that we can still check for this through the shaded screen; why? read where this is used
        name: "dealerIcon",
        clipRegion: {
            x: 536,
            y: 390,
            width: 27,
            height: 16,
        },
        maxPixelDiffAllowed: 0
    },
    push: {
        name: "push",
        clipRegion: {
            x: 632,
            y: 565,
            width: 16,
            height: 7,
        },
        maxPixelDiffAllowed: 0
    }, 
    ignitionError: {
        name: "ignitionError",
        clipRegion: {
            x: 443,
            y: 183,
            width: 391,
            height: 335,
        },
        maxPixelDiffAllowed: 0
    },
    audioOn: {
        name: "audioOn",
        clipRegion: {
            x: 657,
            y: 569,
            width: 102,
            height: 67,
        },
        maxPixelDiffAllowed: 0
    },
    audioOff: {
        name: "audioOff",
        clipRegion: {
            x: 657,
            y: 569,
            width: 102,
            height: 67,
        },
        maxPixelDiffAllowed: 0
    },
    test: {
        name: "test",
        clipRegion: {
            x: 0,
            y: 0,
            width: 0,
            height: 0,
        },
        maxPixelDiffAllowed: 0
    },
} as const; // REMINDER THAT WHEN ADDING HERE, ADD TO REFERENCES!

//#region misc screenshot stuff for better autocomplete
type ScreenshotType = {
    name: string,
    clipRegion: { 
        x: number,
        y: number,
        width: number,
        height: number
    },
    maxPixelDiffAllowed: number
};

type SCREENSHOT_KEYS = keyof typeof SCREENSHOT_INFO;

const SCREENSHOT: Record<SCREENSHOT_KEYS, ScreenshotType> = SCREENSHOT_INFO;
//#endregion

// rotate free models
const models = [
    "gemini-1.5-pro",
    "gemini-1.5-flash-8b",
    "gemini-1.5-flash",
    "gemini-2.0-flash-thinking-exp-01-21",
    "gemini-2.0-flash-lite",
    "gemini-2.0-flash",
    "gemini-2.5-pro-preview-03-25",
    "gemini-2.5-pro-exp", // might not work
    "gemini-2.0-flash-exp", // might not work
];
let modelIndex;

let page: Page;
const DIFF_THRESHOLD = .1;
const POUNCE_METER_MAX = 999999; // if max reached by meter, pounce
const DEFAULT_BET = 1;

let matchesWon: number, matchesLost: number, matchesPushed: number;
let dollarsWon: number, dollarsLost: number;
let wasDoubled: boolean, wasPounce: boolean; // if we ___ this round
let pounceMeter: number;
let prevPlayerCardValuesArrLength: number;

async function main() {
    // delete ./images/current files
    const targetDirectory = 'images/current';
    try {
        await recreateDirectoryWithSubfolder(targetDirectory);
    } catch (error) {
        console.error('\nOperation failed:', error);
        process.exit(1); // Exit with error code if the operation fails
    }

    console.log("=============================================================================================================");

    // getNumDiffPixels(SCREENSHOT.test);

    matchesWon = 0, matchesLost = 0, matchesPushed = 0;
    dollarsWon = 0, dollarsLost = 0;
    wasDoubled = false;
    pounceMeter = 0;
    prevPlayerCardValuesArrLength = 0;

    await page.goto('https://www.ignitioncasino.eu/casino');
    await page.waitForLoadState('networkidle'); // idk why, i think the site just loads unconventionally

    // https://www.ignitioncasino.eu/?sessionExpired=true&overlay=login
    const isSessionExpired = await page.getByRole('heading', { name: 'SESSION EXPIRED' }).isVisible();
    const isLoginButtonPresent = await page.getByRole('link', { name: 'Login' }).isVisible();
    if (isSessionExpired) {
        await page.getByRole('button', { name: ',Close' }).click();
        await login();
    } else if (isLoginButtonPresent) {
        await login();
    } else {
        console.log("already logged in");
    }

    await initGame();

    let roundCounter = 1;
    while (true) {
        console.log(`starting round ${roundCounter}...`);

        let bet = DEFAULT_BET;
        if (pounceMeter >= POUNCE_METER_MAX) {
            console.log("POUNCING!");
            wasPounce = true;
            bet = bet * 2 + 1;
        }

        await doRoundWithBet(bet);
        roundCounter++;
    }


    // stall
    console.log("reached end of main");
    await new Promise(() => {});
}

/** deletes a directory and all its contents, then recreates it with a subdirectory named "spam" inside; directoryPath The absolute or relative path to the target directory */
async function recreateDirectoryWithSubfolder(directoryPath: string): Promise<void> {
    const subfolderName = 'spam';
    const absoluteDirectoryPath = path.resolve(directoryPath); // Get absolute path for clarity
    const subfolderPath = path.join(absoluteDirectoryPath, subfolderName);

    console.log(`Attempting operation on: ${absoluteDirectoryPath}`);
    console.log(`Target subfolder: ${subfolderPath}`);

    try {
        // Step 1: Delete the existing directory recursively.
        // - recursive: true -> Delete contents if the directory exists.
        // - force: true -> Don't throw an error if the directory doesn't exist initially.
        console.log(`Deleting directory (if exists): ${absoluteDirectoryPath}`);
        await fs.rm(absoluteDirectoryPath, { recursive: true, force: true });
        console.log(`Directory deleted or did not exist.`);

        // Step 2: Recreate the main empty directory.
        console.log(`Recreating main directory: ${absoluteDirectoryPath}`);
        await fs.mkdir(absoluteDirectoryPath);
        console.log(`Main directory recreated.`);

        // Step 3: Create the "spam" subfolder inside the new directory.
        console.log(`Creating subfolder: ${subfolderPath}`);
        await fs.mkdir(subfolderPath);
        console.log(`Subfolder '${subfolderName}' created successfully.`);

        console.log(`Operation complete for: ${absoluteDirectoryPath}`);

    } catch (error) {
        console.error(`Error during operation on ${absoluteDirectoryPath}:`, error);
        // Re-throw the error to indicate failure to the caller
        throw new Error(`Failed to recreate directory with subfolder: ${error instanceof Error ? error.message : String(error)}`);
    }
}

async function afterRound() {
    console.log(`totals | wins: ${matchesWon}, losses: ${matchesLost}, pushes: ${matchesPushed}`);
    console.log(`totals | $${dollarsWon} won, $${dollarsLost} lost`);
    console.log(`pounce meter: ${pounceMeter} / ${POUNCE_METER_MAX}`);
    wasDoubled = false;
    prevPlayerCardValuesArrLength = 0;

    if (wasPounce) {
        wasPounce = false;
        pounceMeter = 0;
    }
    await page.waitForTimeout(3000);
}

async function initGame() {
    console.log("initializing game...");

    // go to bj game
    await page.goto('https://www.ignitioncasino.eu/casino?overlay=casino%2Fblackjack%2Fblackjack-games%2Fblackjack');
    await page.waitForTimeout(6000);

    while (true) {
        console.log("checking if in lobby, play, action, or insurance screen...");
        if (await takeScreenshotsAndIsMatch(SCREENSHOT.lobbyScreen)) { // if in lobby screen, get to play screen

            // mute stuff
            while (true) {
                if (await takeScreenshotsAndIsMatch(SCREENSHOT.audioOff)) { // already off if we have called main before this (eg hit error or old hand)
                    break;
                }

                if (await takeScreenshotsAndIsMatch(SCREENSHOT.audioOn)) {
                    // toggle mute
                    await page.getByRole('dialog').locator('iframe').contentFrame().locator('#pixi').click({
                        position: {
                            x: 706,
                            y: 604
                        }
                    });
                    break;
                }
            }

            // play
            await page.getByRole('dialog').locator('iframe').contentFrame().locator('#pixi').click({
                position: {
                    x: 1175,
                    y: 458
                }
            });

            // choose card deck
            await page.getByRole('dialog').locator('iframe').contentFrame().locator('#pixi').click({
                position: {
                    x: 338,
                    y: 332
                }
            });

            // accept
            await page.getByRole('dialog').locator('iframe').contentFrame().locator('#pixi').click({
                position: {
                    x: 1162,
                    y: 360
                }
            });
            
            await page.waitForTimeout(3000);
        }

        if (await takeScreenshotsAndIsMatch(SCREENSHOT.playScreen)) {
            break;
        }

        if (await takeScreenshotsAndIsMatch(SCREENSHOT.playerActions) || await takeScreenshotsAndIsMatch(SCREENSHOT.insurance)) { // if we're continuing an old hand
            await startDoingActionsUntilEnd(0);
            await fullResetCallMain("we were in the middle of a hand, but just finished it");
        }
    }
    
    console.log("game initialized successfully");
}

async function login() {
    console.log("logging in...");
    const email = process.env.EMAIL || "";
    const password = process.env.PASSWORD || "";

    if (email === "" || password === "") {
        throw Error("A value needed to login is missing in env.");
    }

    await page.getByRole('link', { name: 'Login' }).click();
    await page.getByRole('textbox', { name: 'E-mail*' }).click();
    await page.getByRole('textbox', { name: 'E-mail*' }).fill(email);
    await page.getByRole('textbox', { name: 'Password*' }).click();
    await page.getByRole('textbox', { name: 'Password*' }).fill(password);
    await page.getByText('Remember Me').click();
    await page.getByRole('button', { name: 'LOGIN' }).click();

    // confirm success before saving
    await page.locator('button.account-balance.menu-btn').click();
    await page.getByText("Available to withdraw").waitFor({ timeout: 5000 });

    // Save authentication state
    await page.context().storageState({ path: 'auth.json' });

    console.log("logged in successfully");
}

async function placeBetAndDeal(bet: number) {
    console.log(`placing bet of $${bet}...`);

    while (bet > 0) {
        // select chip
        if (bet >= 5) {
            await page.getByRole('dialog').locator('iframe').contentFrame().locator('#pixi').click({
                position: {
                    x: 518,
                    y: 583
                }
            });

            bet -= 5;
        } else {
            await page.getByRole('dialog').locator('iframe').contentFrame().locator('#pixi').click({
                position: {
                    x: 401,
                    y: 585
                }
            });

            bet -= 1;
        }

        await page.waitForTimeout(200);

        // click betting area
        await page.getByRole('dialog').locator('iframe').contentFrame().locator('#pixi').click({
            position: {
                x: 638,
                y: 325
            }
        });

        await page.waitForTimeout(200);
    }

    await page.waitForTimeout(500); // or we can take SS and check if Deal is highlighted instead

    // click Deal
    await page.getByRole('dialog').locator('iframe').contentFrame().locator('#pixi').click({
        position: {
            x: 1172,
            y: 370
        }
    });

    console.log("bet placed and clicked deal");
}

async function doRoundWithBet(bet: number) {
    // check on playing screen
    let isOnMatchScreen = await takeScreenshotsAndIsMatch(SCREENSHOT.playScreen);
    if (!isOnMatchScreen) {
        isOnMatchScreen = await takeScreenshotsAndIsMatch(SCREENSHOT.playScreen);
    }

    await placeBetAndDeal(bet);

    await page.waitForTimeout(2000);

    await startDoingActionsUntilEnd(bet);

    await afterRound();
}

    //               yes ->                    ^---> end   
    //                |------------------------|
    // after deal: playerBJ -> insurance -> dealerBJ -> playerActions
async function startDoingActionsUntilEnd(bet: number) {
    while (true) {
        console.log("(re)checking for BJs or insurance...");

        // handle BJ
        if (await handleBlackjackMatch(bet)) {
            return;
        }

        // handle insurance
        const insuranceMatch = await handleInsuranceMatch(bet);
        if (insuranceMatch == 1) {
            return;
        } else 
        if (insuranceMatch == 2) {
            break;
        }

        if (await takeScreenshotsAndIsMatch(SCREENSHOT.playerActions)) {
            console.log("no BJs or insurance, continuing");
            break;
        }

        if (await takeScreenshotsAndIsMatch(SCREENSHOT.ignitionError)) { // yes we can error here too...
            await fullResetCallMain("ignition error");
        }
    }

    // do action until not on action screen; we must be guaranteed to be on action screen when starting loop
    while (true) {
        await doAction();
        await page.waitForTimeout(2000);

        // ensure we are on action screen before doing another action
        // we need to check win/loss and we can only do so for a few seconds since its an animation
        // we dont check loss bc its gray and might pass for wrong reasons, eg when the error pops up idek why
        while (true) {
            console.log("(re)checking if won, pushed, on play screen, or on action screen before doing another action...");

            if (await takeScreenshotsAndIsMatch(SCREENSHOT.playerActions)) {
                break;
            }

            if (await takeScreenshotsAndIsMatch(SCREENSHOT.win)) {
                await handleWin(bet);
                return;
            }

            if (await takeScreenshotsAndIsMatch(SCREENSHOT.loss)) {
                await handleLoss(bet);
                return;
            }
            
            if (await takeScreenshotsAndIsMatch(SCREENSHOT.playScreen)) {
                matchesPushed++;
                console.log("round completed, pushed");
                return;
            }

            if (await takeScreenshotsAndIsMatch(SCREENSHOT.ignitionError)) {
                await fullResetCallMain("ignition error");
            }
        }
    }
}

async function handleWin(bet: number) {
    matchesWon++;
    dollarsWon += bet + (wasDoubled ? bet : 0);
    pounceMeter = 0;
    console.log("round completed, won");
}

async function handleLoss(bet: number) {
    matchesLost++;
    dollarsLost += bet + (wasDoubled ? bet : 0);
    pounceMeter++;
    console.log("round completed, lost");
}

/** returns: 0 if insurance didnt match; otherwise, 1 if blackjack match, 2 if playerAction match */
async function handleInsuranceMatch(bet: number) {
    if (await takeScreenshotsAndIsMatch(SCREENSHOT.insurance)) {
        await page.getByRole('dialog').locator('iframe').contentFrame().locator('#pixi').click({
            position: {
                x: 1172,
                y: 474
            }
        });
        console.log("clicked no insurance");

        while (true) {
            if (await handleBlackjackMatch(bet)) {
                return 1;
            }

            if (await takeScreenshotsAndIsMatch(SCREENSHOT.playerActions)) {
                return 2;
            }
        }
    }
    return 0;
}

async function handleBlackjackMatch(bet: number) {
    if (await takeScreenshotsAndIsMatch(SCREENSHOT.dealerIcon)) { // dealer icon is only present (before user action) if someone got BJ
        console.log("BJ found, checking who...");

        while (true) {
            if (await takeScreenshotsAndIsMatch(SCREENSHOT.win)) {
                console.log("player got BJ!");
                await handleWin(bet);
                return true;
            }

            if (await takeScreenshotsAndIsMatch(SCREENSHOT.loss)) {
                console.log("dealer got BJ");
                pounceMeter++;
                await handleLoss(bet);
                return true;
            }

            if (await takeScreenshotsAndIsMatch(SCREENSHOT.playScreen)) {
                matchesPushed++;
                console.log("player and dealer got BJ");
                console.log("round completed, pushed");
                return true;
            }
        }
    }
    return false;
}

async function doAction() {
    console.log("choosing an action...");

    const [ playerCardsArray, dealerCardValue ] = await takeScreenshotAndGetCardValues();

    // GetRecommendedPlayerAction(playerCards, dealerCard, handCount, dealerCheckedBlackjack, options)
    const action = BJ_STRATEGY.GetRecommendedPlayerAction(playerCardsArray, dealerCardValue, 1, true, BJ_OPTIONS);

    if (action === "stand") {
        await page.getByRole('dialog').locator('iframe').contentFrame().locator('#pixi').click({
            position: {
                x: 1169,
                y: 448
            }
        });
    } else if (action === "hit") {
        await page.getByRole('dialog').locator('iframe').contentFrame().locator('#pixi').click({
            position: {
                x: 1172,
                y: 271
            }
        });
    } else if (action === "double") {
        await page.getByRole('dialog').locator('iframe').contentFrame().locator('#pixi').click({
            position: {
                x: 1178,
                y: 108
            }
        });
        wasDoubled = true;
    } else {
        throw new Error(`Unknown action: ${action}`);
    }

    console.log("action completed:", action);

    await page.waitForTimeout(200);
}


// sometimes game can bug; we hit but the card isnt actually shown and next action becomes avail. so, if we get same card val as last function call we will just full reset, call main
// let prevPlayerCardValuesArrLength; this is declared at the top!
async function takeScreenshotAndGetCardValues() {
    console.log(`getting card values...`);
    await takeScreenshot(SCREENSHOT.cardValues);

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    
    const uploadedImage = await ai.files.upload({
        file: `images/current/${SCREENSHOT.cardValues.name}.png`,
        config: { mimeType: "image/png" },
    });

    const result = await ai.models.generateContent({
        model: "gemini-2.0-flash-001",
        config: {
            temperature: 0
        },
        contents: createUserContent([
            createPartFromUri(uploadedImage.uri as string, uploadedImage.mimeType as string),
            "\n\n", `
            In the image, there are two sets of playing cards. One set (of a single card) is at the top and the other set is at the bottom; they are separated by the blue. 
            Let face cards (denoted by J, Q, K) equal 10 and Ace (A) equal 1. There are no cards with 0, check if it was actually a 'Q'. Card suits do not matter.
            Respond with only one thing: a number array, with the numbers in the bottom set first, and the number in the top set last.

            Some examples: 
            You see 'A' in the top set and '2 Q 10' in the bottom set, respond with only: [2, 10, 10, 1]
            You see 'K' in the top set and '5 J' in the bottom set, respond with only: [5, 10, 10]
            You see '9' in the top set and 'Q A 5' in the bottom set, respond with only: [10, 1, 5, 9]
            `,
        ]),
    });

    console.log("raw response:", result.text);

    const responseArray: number[] = JSON.parse(result.text as string);
    const playerCardsArray = responseArray.slice(0, -1);
    const dealerCardValue = responseArray[responseArray.length - 1];
    console.log("dealerCardValue:", calculateBlackjackScores([ dealerCardValue ]));
    console.log("playerCards: " + playerCardsArray + " =", calculateBlackjackScores(playerCardsArray));

    // game has bugged/lagging and we need to reset
    if (prevPlayerCardValuesArrLength === playerCardsArray.length) {
        await fullResetCallMain("game is lagging, got same playerCardsArray as previous call");
    } else if (playerCardsArray.length === 1) {
        await fullResetCallMain("game is lagging, playerCardsArray length is 1");
    }

    prevPlayerCardValuesArrLength = playerCardsArray.length;
    return [playerCardsArray, dealerCardValue];
}

async function fullResetCallMain(reason?: string) {
    console.log(reason);
    console.log("calling main again...")
    await main();
    throw new Error(`fullResetCallMain was used: ${reason}`); // although we never see this since we always ctrl c anyway
}

/** calculates all possible valid Blackjack scores (21 or under)*/
function calculateBlackjackScores(hand: number[]): number[] {
    let aceCount = 0;
    let baseSum = 0;

    for (const card of hand) {
        if (card === 1) {
            aceCount++;
            baseSum += 1; // treat ace as 1 initially
        } else {
            baseSum += card;
        }
    }

    // duplicate scores
    const possibleScoresSet = new Set<number>();

    if (baseSum <= 21) {
        possibleScoresSet.add(baseSum);
    }

    // upgrade aces one by one
    let currentSum = baseSum;
    for (let i = 0; i < aceCount; i++) {
        // add 10 to upgrade one Ace from 1 to 11
        currentSum += 10;
        if (currentSum <= 21) {
            possibleScoresSet.add(currentSum);
        } else {
            // adding 10 busts the score, no further upgrades
            break;
        }
    }

    const finalScores = Array.from(possibleScoresSet).sort((a, b) => a - b);

    return finalScores;
}

/** 
 * repeatedly takes screenshot and attempts to match; returns true if finally matches screenshot 
 * 
 * triesLeft: multiply this TIME_BEFORE_RETRY / 1000 by to get how many seconds that we try to match
 * */
async function takeScreenshotsAndIsMatch(screenshot: ScreenshotType, matchUntilTrue = false) {
    const TIME_BEFORE_RETRY = 100;

    console.log(`checking if ${screenshot.name} screenshot matches... (${matchUntilTrue ? "matchingUntilTrue" : "single"})`);

    await takeScreenshot(screenshot);
    const numDiffPixels = await getNumDiffPixels(screenshot);

    if (numDiffPixels > screenshot.maxPixelDiffAllowed) {
        await page.waitForTimeout(TIME_BEFORE_RETRY);

        if (!matchUntilTrue) {
            console.log(`|----- couldn't find ${screenshot.name}, returning`);
            return false;
        }
        
        console.log("|----- retrying to match", screenshot.name);

        return await takeScreenshotsAndIsMatch(screenshot, matchUntilTrue);
    }
    
    console.log(`|----- ${screenshot.name} matches`);
    return true;
}

async function takeScreenshot(screenshot: ScreenshotType, fileName?: string) {
    await page.screenshot({
        path: `images/current/${fileName || screenshot.name}.png`,
        clip: screenshot.clipRegion,
    });

    console.log("|----- screenshotted", fileName || screenshot.name)

    // spam folder for easier dev
    await page.screenshot({
        path: `images/current/spam/${Date.now()}.png`,
        clip: SCREENSHOT.fullscreen.clipRegion,
    });
}

// only can be called if the screenshot exists in current/, so only call this after takeScreenshot
async function getNumDiffPixels(screenshot: ScreenshotType) {
    const currentImage = PNG.sync.read(await fs.readFile(`images/current/${screenshot.name}.png`));
    const referenceImage = PNG.sync.read(await fs.readFile(`images/references/${screenshot.name}.png`));

    if (currentImage.width !== referenceImage.width || currentImage.height !== referenceImage.height) {
        throw new Error('Images have different dimensions!');
    }

    const diff = new PNG({ width: currentImage.width, height: currentImage.height });
    const numDiffPixels = pixelmatch(
        currentImage.data,
        referenceImage.data,
        diff.data,
        currentImage.width,
        currentImage.height,
        { threshold: DIFF_THRESHOLD }
    );

    console.log(`|----- ${screenshot.name} differs by ${numDiffPixels} pixels`);

    return numDiffPixels;
}