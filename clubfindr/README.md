# Clubfindr

A little PoC (WiP, too!) for Clubfindr.

## Run

Refresh your local package index first by typing:

    sudo apt update

Then install Node.js:

    sudo apt install nodejs

Install pnpm

    npm i -g pnpm

Install all dependencies with:

    pnpm i

Then, create a new `.env` file with your Spotify credentials:

    cp template.env .env
    # edit the file to set your client_id and client_secret
    # taken from the Spotify Dashboard at developer.spotify.com

Finally, launch the app with:

    pnpm dev

and open a new browser window pointing at http://localhost:3000

## To do

1. Use `top-artists` instead of `top-tracks`
2. The rest of the app :P
