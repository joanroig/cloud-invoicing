# Sheets to invoices

Little NodeJS project to create compliant German invoices from a Google Sheets accounting document.

Features:

- Track customers, products and orders
- Generate and manage invoice data
- Automatic generation of invoice date and invoice number
- Export invoices in pdf format (only in German language)

See the [invoice examples](examples/) and start your own [accounting](https://docs.google.com/spreadsheets/d/1JRJ3KQetNAAPzsJat-JH7iIzc3OGumWQyFL5MZfm5UU/copy) sheet.

<em>Note: This project may not be useful if you have different needs or if you already have another kind of accounting system. This is all based on my experience and needs.</em>

---

## Requirements

You will only need Node.js and a node global package, Yarn, installed in your environement.

### Node

- #### Node installation on Windows

  Just go on [official Node.js website](https://nodejs.org/) and download the installer.
  Also, be sure to have `git` available in your PATH, `npm` might need it (You can find git [here](https://git-scm.com/)).

- #### Node installation on Ubuntu

  You can install nodejs and npm easily with apt install, just run the following commands.

      $ sudo apt install nodejs
      $ sudo apt install npm

- #### Other Operating Systems
  You can find more information about the installation on the [official Node.js website](https://nodejs.org/) and the [official NPM website](https://npmjs.org/).

If the installation was successful, you should be able to run the following command.

    $ node --version
    v16.14.0

    $ npm --version
    8.3.1

If you need to update `npm`, you can make it using `npm`! Cool right? After running the following command, just open again the command line and be happy.

    $ npm install npm -g

###

### Yarn installation

After installing node, this project will need yarn too, so just run the following command.

      $ npm install -g yarn

---

## Install

    $ git clone https://github.com/joanroig/sheets-to-invoices
    $ cd sheets-to-invoices
    $ yarn install

## Configure app

Create a `.env` file in the root directory based on the provided `.env.example`, then edit it with your settings. You will need to:

- Create a service account, get one by following this guide: https://theoephraim.github.io/node-google-spreadsheet/#/getting-started/authentication?id=service-account
- Put the `private_key` and `client_email` values from the JSON you obtained in the previous step in the `.env` file respectively.
- Do a copy of the provided template: https://docs.google.com/spreadsheets/d/1JRJ3KQetNAAPzsJat-JH7iIzc3OGumWQyFL5MZfm5UU/copy
- Share the sheet with the email of your service account (this allows the service account to access your sheet). To do this, go in your copy of the template and press the share button, then enter the service account email and send the invitation.
- Put the Sheet ID from the URL of your sheet into the `sheet_id` of the `.env` file, the ID should look similar to this: `1JRJ3KQetNAAPzsJat-JH7iIzc3OGumWQyFL5MZfm5UU`

## Running the project

Add some data in the sheet and activate the checkboxes of the Run column in the Orders tab for each invoice you want to generate.

Then, run this command and check the console output and the out folder for your results:

    $ yarn start

## Simple build for production

    $ yarn build

## Credits

PDF templade based on: https://gist.github.com/maxkostinevich/c26bfb09450341ad37c1bd6c2cc51bb2
