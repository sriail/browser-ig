# Browser IG - QEMU Browser Emulator

A web-based browser emulator powered by QEMU with configurable RAM and VRAM settings. Features a modern, theme-aware frontend interface similar to browser.lol.

## Features

- **Multiple Browser Support**: Choose from Midori, Waterfox, or Brave browsers
- **Configurable RAM**: Select from 1GB, 2GB, 4GB, 6GB, 8GB, 10GB, 12GB, or Unlimited
- **Configurable VRAM**: Choose from 40MB, 80MB, 104MB, 200MB, 304MB, 400MB, 504MB, 600MB, 704MB, 800MB, or 1GB
- **Theme-Aware UI**: Automatically switches between light and dark themes based on your browser's color scheme
- **Inverse Logo Display**: Logos and favicons are inverted based on the theme (light assets in dark mode, dark assets in light mode)
- **Real-time Console**: View emulator output in real-time
- **QEMU Backend**: Powered by QEMU for efficient virtualization

## Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- (Optional) QEMU installed on your system for full emulation

**Note**: The application will run in simulation mode if QEMU is not installed, which is perfect for testing and demonstration.

## Installation

1. Clone the repository:
```bash
git clone https://github.com/sriail/browser-ig.git
cd browser-ig
```

2. Install dependencies:
```bash
npm install
```

## Usage

### Starting the Server

```bash
npm start
```

For development with auto-reload:
```bash
npm run dev
```

The server will start on `http://localhost:3000`

### Using the Application

1. Open your browser and navigate to `http://localhost:3000`
2. Select your desired browser (Midori, Waterfox, or Brave)
3. Choose RAM amount (1GB - Unlimited)
4. Choose VRAM amount (40MB - 1GB)
5. Click "Start Emulator"
6. Monitor the console output and emulator status
7. Click "Stop" when you're done

## Theme Support

The application automatically detects your browser's color scheme preference:

- **Light Mode**: Uses dark logo and favicon on a light background
- **Dark Mode**: Uses light logo and favicon on a dark background

The theme switches automatically when you change your system/browser theme preference.

## API Endpoints

### POST `/api/start-emulator`
Start a new emulator instance.

**Request Body**:
```json
{
  "browser": "midori|waterfox|brave",
  "ram": "1|2|4|6|8|10|12|unlimited",
  "vram": "40|80|104|200|304|400|504|600|704|800|1024"
}
```

**Response**:
```json
{
  "success": true,
  "emulatorId": "uuid",
  "output": "startup messages"
}
```

### GET `/api/emulator-status/:id`
Get the status of a running emulator.

**Response**:
```json
{
  "running": true,
  "output": "console output",
  "config": { ... },
  "uptime": 123
}
```

### POST `/api/stop-emulator/:id`
Stop a running emulator.

**Response**:
```json
{
  "success": true,
  "message": "Emulator stopped"
}
```

### GET `/api/emulators`
List all active emulators.

**Response**:
```json
{
  "emulators": [
    {
      "id": "uuid",
      "browser": "brave",
      "ram": "4",
      "vram": "200",
      "running": true,
      "uptime": 456
    }
  ]
}
```

## File Structure

```
browser-ig/
├── public/
│   ├── images/
│   │   ├── brave.png
│   │   ├── midori.webp
│   │   ├── waterfox.png
│   │   ├── browser_ig_logo_light.png
│   │   ├── browser_ig_logo_dark.png
│   │   ├── favicon_light.png
│   │   └── favicon_dark.png
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── server.js
├── package.json
├── .gitignore
└── README.md
```

## Technology Stack

- **Frontend**: HTML5, CSS3 (with CSS Custom Properties for theming), Vanilla JavaScript
- **Backend**: Node.js, Express.js
- **Emulation**: QEMU (with simulation fallback)
- **Process Management**: Node.js child_process

## Browser Support

The application supports all modern browsers that implement:
- CSS `prefers-color-scheme` media query
- Fetch API
- ES6+ JavaScript

Tested on:
- Chrome/Edge 90+
- Firefox 88+
- Safari 14+

## Development

### Project Structure

- `public/index.html` - Main HTML interface
- `public/styles.css` - Styling with theme support
- `public/app.js` - Frontend JavaScript logic
- `server.js` - Express server with QEMU integration

### Adding New Browsers

To add a new browser:

1. Add browser icon to `public/images/`
2. Update `browserIcons` object in `public/app.js`
3. Update `browserConfigs` object in `server.js`
4. Add option to browser select dropdown in `index.html`

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.
