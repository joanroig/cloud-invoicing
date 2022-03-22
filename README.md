# Sheets to invoices

Little NodeJS project to create compliant German invoices from a Google Sheets accounting document. Deployable to Google App Engine and automatable via Apps Script.

Features:

- Track customers, products and orders
- Generate and manage invoice data
- Automatic generation of invoice date and invoice number
- Optional small business and reverse charge notices
- Export invoices in pdf format (only in German language)
- Optional: Upload invoices to Google Drive
- Optional: Google Cloud Platform integration for a fully automated solution

What is not implemented:

- VAT calculation

See the [invoice examples](examples/) and start your own [accounting](https://docs.google.com/spreadsheets/d/1JRJ3KQetNAAPzsJat-JH7iIzc3OGumWQyFL5MZfm5UU/copy) sheet.

_Note: This project may not be useful if you have different needs or if you already have another kind of accounting system. This is all based on my experience and needs._

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

- Create a service account, get one by following [this guide](https://theoephraim.github.io/node-google-spreadsheet/#/getting-started/authentication?id=service-account).
- Put the `private_key` and `client_email` values from the JSON you obtained in the previous step in the `.env` file respectively.
- [Do a copy](https://docs.google.com/spreadsheets/d/1JRJ3KQetNAAPzsJat-JH7iIzc3OGumWQyFL5MZfm5UU/copy) of the provided template.
- Share the sheet with the email of your service account (this allows the service account to access your sheet). To do this, go in your copy of the template and press the share button, then enter the service account email and send the invitation.
- Put the Sheet ID from the URL of your sheet into the `sheet_id` of the `.env` file, the ID should look similar to this: `1JRJ3KQetNAAPzsJat-JH7iIzc3OGumWQyFL5MZfm5UU`

### Automatic upload to Drive

_Note: You can disable the upload of invoices by setting the property `upload-to-drive` to `false` in `config/default.json`._

To configure it:

- Create a folder in Drive and share the folder with the email your service account.
- Put the folder ID from the URL of your Drive folder into the `folder_id` of the `.env` file.

## Running the project manually

Add some data in the sheet and activate the checkboxes of the `Run` column in the `Orders` tab for each invoice you want to generate.

Then, run this command and check the console output and the out folder for your results:

    $ yarn start:run

## Build and run the production server

The project can run as a server to execute the invoice generation on demand. This will be used in next steps to trigger invoice generation directly on the cloud. You can test it locally by executing those commands, and then accessing the http://localhost:8080 in your browser every time you want to trigger the generation:

    $ yarn build
    $ yarn start

## Apps Script & Google App Engine integration

After verifying that everything works locally, you may want to automate the PDF generation on the cloud.

**Heads up: This may take a lot time and troubleshooting if you are not experienced with the Google Cloud platform.**

We need to create a Google Cloud project, upload the code to App Engine, create an Apps Script and secure the communication between Apps Script and App Engine to finally trigger the invoice generator from the accounting sheet.

To provide a better understanding of all actors, the process flow looks like this:

1. `Google Sheet` triggers `Apps Script`
2. `Apps Script` sends POST request to `App Engine` and does authenticate via `IAP`
3. `App Engine` runs the `Invoice Generator`
4. The `Invoice Generator` uses a `Service Account` to:
   - Read `Google Sheet` and check all data
   - Update `Google Sheet`
   - Upload invoices to `Google Drive`

Following the guide **completely** will require to enable multiple Google Cloud APIs. You will be asked to enable them when needed via CLI or via the Google Cloud website:

- Cloud Billing API
- Cloud Logging API
- Cloud Build API
- Google Sheets API
- Google Drive API
- Cloud Identity-Aware Proxy API
- Cloud Pub/Sub API
- Cloud Functions API

### Google App Engine setup

- [Create a Google Cloud project](https://console.cloud.google.com/cloud-resource-manager) and [enable billing](https://console.cloud.google.com/billing) for it.
- _Optional: configure a Cloud Function to prevent unwanted billings with the [official documentation](https://cloud.google.com/billing/docs/how-to/notify) or with [this video](https://www.youtube.com/watch?v=KiTg8RPpGG4_).\_
- [Install gcloud CLI](https://cloud.google.com/sdk/docs/install-sdk) and run `gcloud init` in the project root folder and connect to your project.
- Run the command `yarn gcloud:deploy` in the root directory to upload the nodejs project. The build folder will be built and then deployed, if you execute the command `gcloud app deploy` remember to build the project before.
- [Enable IAP](https://console.cloud.google.com/security/iap) for the project (toggle the button for your App Engune app), select "All Web Services" and add the gmail you use to access in the Google Sheets document by pressing the "Add Principal" button. Assign the role `IAP-secured Web App User`
- If done right, go to the url that appears in the IAP (Published column) with the format `[...]appspot.com` and you should be able to access the deployed code only with the email of the previous step.

### Apps Script setup

- Open your accounting sheet, in the menu open `Extensions > Apps Script`
- Go to the configuration of the Apps Script, toggle the `Show "appsscript.json" manifest file in editor` checkbox.
- Also in the configuration, assign the Project Number of the Google Cloud project (get it here: https://console.cloud.google.com/home/dashboard).
- Copy the `appsscript.json` and the `Code.gs` file from the examples/Apps Script folder in the Apps Script files.
- Edit the Code.gs file to add your own credentials:
  - Go to [credentials](https://console.cloud.google.com/apis/credentials) and create a new OAuth 2.0 Client ID of type `Web application`. Use the client id and secret for the next for the `CLIENT_ID` and `CLIENT_SECRET`.
  - The `IAP_CLIENT_ID` can be found in the [credentials](https://console.cloud.google.com/apis/credentials), it is named `IAP-App-Engine-app`. You just need to copy the Client ID.
  - The `IAP_URL` is the URL that has the format `[...]appspot.com`.

### Running on the cloud

Now you should be able to open your accounting sheet and find a menu called `Generate Invoices`, click the `Run now` option and the invoices should appear in your Drive folder.

### Debugging on the cloud

Check the latest run logs on Google App Engine by running this command:

    $ yarn run gcloud:logs

Remember that you can always redeploy by running:

    $ yarn run gcloud:deploy

## Credits

PDF template based on: https://gist.github.com/maxkostinevich/c26bfb09450341ad37c1bd6c2cc51bb2
