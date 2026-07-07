# Bitfocus Companion Module for Internet Clicker

This module allows you to control Internet Clicker (and Cliqer) presentations directly from Bitfocus Companion using the SignalR event code methodology.

## Getting Started (Loading in Companion)

To use this module in Bitfocus Companion:

1. Download the `internetclicker-1.0.7.tgz` file from the root of this repository.
2. Open the Bitfocus Companion GUI.
3. Go to the **Modules** tab.
4. Click the yellow **Import module package** button (as seen at the top of the Manage Modules page).
5. Select the `.tgz` file you just downloaded.
6. Once imported, go to the **Connections** tab, search for `Internet Clicker`, and click Add.
7. Fill out the configuration field using your Event Code.

## Configuration

When adding this module in Companion, you will need to provide the following details:

* **Event Code**: The unique pairing code used for your presentation.

## Available Actions

* **Next Slide**: Advances the presentation to the next slide.
* **Previous Slide**: Goes back one slide.
* **Start Timer**: Starts the presentation timer.
* **Pause Timer**: Pauses the presentation timer.
* **Stop Timer**: Stops the presentation timer.

## Development

To build this module locally:

1. Install dependencies:
   ```bash
   npm install
   ```
2. Build the module:
   ```bash
   npm run build
   ```
3. To develop with auto-recompilation on changes:
   ```bash
   npm run dev
   ```

See the [Companion Connection Developers' Guide](https://github.com/bitfocus/companion/wiki/Module-Development) for more information on testing custom modules.
