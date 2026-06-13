# Speed Test Chrome Extension

![Extension Screenshot](../speed100/icons/extension.png) *(Add your screenshot image)*

A lightweight Chrome extension that measures your internet connection's download and upload speeds, plus displays network information.

## Features

- 🚀 Accurate download/upload speed testing
- 📊 Visual speedometer display
- 🌐 Network information (IP, connection type, latency)
- ⚙️ Configurable automatic testing intervals
- 📈 Historical data visualization (if implemented)
- 🔄 Background testing with desktop notifications (low-speed alerts + data-cap reached)
- 🛡️ **Data guard:** Pauses background tests on metered / data-saver connections and respects an optional monthly data cap
- 🧠 **AI Insights:** Provides intelligent analysis of your network performance, including personalized recommendations and predictions.

## Installation

1. Download the latest release from the [Releases page](#) *(or Chrome Web Store link)*
2. Unzip the package (if downloaded as zip)
3. In Chrome:
   - Go to `chrome://extensions`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the extension folder

## Usage

- Click the extension icon to open the popup
- Click "Run Speed Test" for manual testing
- Click the ⚙️ icon to configure automatic testing intervals
- Results are displayed in Mbps with visual indicators

## Configuration

Configure in settings:
- Automatic test frequency (15/30/60 minutes or disabled)
- Pause automatic tests on metered / data-saver connections (default: on)
- Monthly data cap in MB (0 = unlimited); shows data used this month
- Low-speed alert threshold in Mbps (0 = off) — desktop notification on drop & recovery
- Speed units (Mbps/Gbps)

## Technical Details

- Uses Cloudflare's speed test endpoints
- Measures actual throughput with multi-chunk testing
- Calculates median speeds for accuracy
- Caches network information to reduce API calls

## Development

```bash
git clone [https://github.com/SumanReddy568/speed100]
cd speed100
```