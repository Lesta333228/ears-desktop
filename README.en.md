# Ears Desktop — equalizer for Windows application audio

[Русский](README.md) · **English** · [Download for Windows](https://github.com/Lesta333228/ears-desktop/releases/latest)

Adjust the sound of a Windows application with an 11-band equalizer, bass boost and reusable presets. Application audio is routed through **VB-CABLE**, installed separately.

![Ears Desktop interface](docs/images/desktop.png)

## Features

- 11 EQ bands with adjustable frequency, gain and Q.
- Bass Boost preset and a live spectrum display.
- Application selection, including background processes.
- Custom presets with JSON import and export.
- Built-in player for local audio files; this does not require VB-CABLE.
- Restoration of the selected application's previous audio output when processing stops or Ears closes normally.

## Quick start

1. Use Windows 10/11 x64. Install [VB-CABLE from its official website](https://vb-audio.com/Cable/) and restart your PC if you want to process other applications.
2. Download `Ears-Desktop-1.0.0-Windows-x64.zip` from [Releases](https://github.com/Lesta333228/ears-desktop/releases/latest). Extract the entire archive and run `Ears Desktop.exe`. Keep its accompanying folders and files together.
3. Start playback in the application you want to process. Refresh the application list in Ears and select it; enable background processes if needed.
4. Choose your physical headphones or speakers as the output, then enable processing.
5. Try Bass Boost or adjust the EQ bands and save a preset.

Keep your physical headphones or speakers as the Windows default playback device. Do not make CABLE Input the system default output.

## Audio routing and limitations

Application → VB-CABLE → Ears Desktop → headphones / speakers.

Compatibility depends on how an application selects its audio output. You may need to restart playback or manually select CABLE Input in that application's settings. This version processes one selected application; it is not intended for independent simultaneous processing with different presets.

If sound is distorted, reduce Volume or band gain. If the cable is missing, install VB-CABLE, restart Windows and refresh the device list. If another application is feeding the cable, stop it or restore its physical output in the Windows mixer.

## Run from source

Install Node.js and npm, then run these commands from the repository root:

```sh
npm install
npm start
```

```sh
npm run self-test
npm run package:win
```

The self-test checks the audio graph, presets, process list and EQ dragging at different scales. It does not verify real audio routing from Spotify or Yandex Music. Packaging requires Windows x64 and writes the portable build and ZIP to `dist`.

## Feedback

[Report a bug](https://github.com/Lesta333228/ears-desktop/issues/new?template=bug_report.yml) or [suggest a feature](https://github.com/Lesta333228/ears-desktop/issues/new?template=feature_request.yml). Include your Windows version, Ears version, audio source and reproduction steps.

If Ears Desktop is useful to you, consider starring the repository or sharing its link with someone who needs an application equalizer.

## Credits

This independent desktop adaptation uses the interface of Ears Audio Toolkit, Electron, Web Audio API, Snap.svg and NirSoft SoundVolumeCommandLine. It does not claim affiliation with the browser extension's official team, Spotify or Yandex Music. Third-party components have their own licenses; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
