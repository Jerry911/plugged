// Copyright 2026 Pleysier Jeroen
// SPDX-License-Identifier: AGPL-3.0-only
package com.pleysje.plugged.desktop;

import com.pleysje.plugged.PluggedApplication;
import java.awt.BorderLayout;
import java.awt.Desktop;
import java.awt.FlowLayout;
import java.awt.GraphicsEnvironment;
import java.io.IOException;
import java.net.InetAddress;
import java.net.ServerSocket;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.Locale;
import java.util.Properties;
import javax.swing.BorderFactory;
import javax.swing.JButton;
import javax.swing.JFrame;
import javax.swing.JLabel;
import javax.swing.JPanel;
import javax.swing.SwingUtilities;
import javax.swing.WindowConstants;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.ConfigurableApplicationContext;

/**
 * Plugged as a program on one computer, for somebody who works alone (an independent electrician): no server to install, no account to
 * make. Started with {@code --desktop} (the installers made by desktop/jpackage.sh do so):
 * <ul>
 *   <li>the data (database, logs) lives in a folder of the user ({@link #dataDirectory()}; env var PLUGGED_HOME overrides it);</li>
 *   <li>the server only listens on 127.0.0.1, on the first free port from {@link #FIRST_PORT} (always the same one when it is free, so the
 *       browser keeps what it stored for Plugged: the offline copies, the theme);</li>
 *   <li>one local account, made at the first start (profile "desktop", {@link DesktopMode}); the browser is signed in with a one-time link,
 *       nobody types a password;</li>
 *   <li>a small window shows that Plugged runs, opens it in the browser again and stops it. Starting the program a second time does not
 *       start a second server: the running one opens the browser.</li>
 * </ul>
 */
public final class DesktopLauncher {
    public static final String ARGUMENT = "--desktop";
    static final int FIRST_PORT = 47800;
    static final int PORTS_TO_TRY = 20;
    /** The file in the data folder through which a second start asks the running one to open the browser: port and secret. */
    static final String INSTANCE_FILE = "instance.properties";

    private DesktopLauncher() {
    }

    public static void main(String[] arguments) throws Exception {
        Path data = dataDirectory();
        Files.createDirectories(data);
        if (askRunningInstance(data)) return;
        int port = freePort();
        ConfigurableApplicationContext context = new SpringApplicationBuilder(PluggedApplication.class)
                .profiles("desktop", "file")
                .headless(!hasScreen())
                .run(withSettings(arguments, port, data));
        DesktopMode mode = context.getBean(DesktopMode.class);
        mode.writeInstanceFile(data.resolve(INSTANCE_FILE), port);
        mode.openBrowser();
        if (!GraphicsEnvironment.isHeadless()) SwingUtilities.invokeLater(() -> showWindow(context, mode, port, data));
    }

    /** Is there a screen to show the window on (a Linux server without X or Wayland has none: Plugged then runs without the window). */
    static boolean hasScreen() {
        String os = System.getProperty("os.name", "").toLowerCase(Locale.ROOT);
        if (os.contains("win") || os.contains("mac")) return true;
        return System.getenv("DISPLAY") != null || System.getenv("WAYLAND_DISPLAY") != null;
    }

    /** The folder of the data: PLUGGED_HOME, else the usual place for program data of the operating system. */
    public static Path dataDirectory() {
        String home = System.getenv("PLUGGED_HOME");
        if (home != null && !home.isBlank()) return Path.of(home);
        String os = System.getProperty("os.name", "").toLowerCase(Locale.ROOT), user = System.getProperty("user.home");
        if (os.contains("win")) {
            String local = System.getenv("LOCALAPPDATA");
            return Path.of(local != null && !local.isBlank() ? local : user, "Plugged");
        }
        if (os.contains("mac")) return Path.of(user, "Library", "Application Support", "Plugged");
        String xdg = System.getenv("XDG_DATA_HOME");
        return Path.of(xdg != null && !xdg.isBlank() ? xdg : Path.of(user, ".local", "share").toString(), "plugged");
    }

    static int freePort() throws IOException {
        for (int port = FIRST_PORT; port < FIRST_PORT + PORTS_TO_TRY; port++) {
            try (ServerSocket socket = new ServerSocket(port, 1, InetAddress.getLoopbackAddress())) {
                return port;
            } catch (IOException taken) {
                // the next one
            }
        }
        try (ServerSocket socket = new ServerSocket(0, 1, InetAddress.getLoopbackAddress())) {
            return socket.getLocalPort();
        }
    }

    /** Is Plugged already running for this data folder: then it is asked to open the browser, and true is answered. */
    static boolean askRunningInstance(Path data) {
        Path file = data.resolve(INSTANCE_FILE);
        if (!Files.isRegularFile(file)) return false;
        try {
            Properties instance = new Properties();
            try (var reader = Files.newBufferedReader(file, StandardCharsets.UTF_8)) {
                instance.load(reader);
            }
            HttpRequest request = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + Integer.parseInt(instance.getProperty("port")) + "/desktop/show"))
                    .timeout(Duration.ofSeconds(3)).header(DesktopMode.INSTANCE_HEADER, instance.getProperty("secret", ""))
                    .POST(HttpRequest.BodyPublishers.noBody()).build();
            try (HttpClient client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).proxy(HttpClient.Builder.NO_PROXY).build()) {
                return client.send(request, HttpResponse.BodyHandlers.discarding()).statusCode() == 204;
            }
        } catch (Exception notRunning) {
            return false; // a file left behind by a run that ended without cleaning up
        }
    }

    /** The arguments without --desktop, with the port and the data folder as command line settings (above application.properties). */
    static String[] withSettings(String[] arguments, int port, Path data) {
        return java.util.stream.Stream.concat(java.util.Arrays.stream(arguments).filter(argument -> !ARGUMENT.equals(argument)),
                java.util.stream.Stream.of("--server.port=" + port, "--plugged.desktop.data-dir=" + data.toAbsolutePath())).toArray(String[]::new);
    }

    private static void showWindow(ConfigurableApplicationContext context, DesktopMode mode, int port, Path data) {
        boolean dutch = Locale.getDefault().getLanguage().equals("nl"), french = Locale.getDefault().getLanguage().equals("fr");
        JFrame frame = new JFrame("Plugged");
        try {
            var icon = DesktopLauncher.class.getResource("/static/icons/icon-192.png");
            if (icon != null) frame.setIconImage(javax.imageio.ImageIO.read(icon));
        } catch (IOException ignored) {
            // the default icon of Java
        }
        frame.setDefaultCloseOperation(WindowConstants.DO_NOTHING_ON_CLOSE);
        JLabel label = new JLabel(dutch ? "Plugged draait op http://127.0.0.1:" + port : french ? "Plugged tourne sur http://127.0.0.1:" + port
                : "Plugged runs on http://127.0.0.1:" + port);
        label.setBorder(BorderFactory.createEmptyBorder(12, 12, 4, 12));
        JButton open = new JButton(dutch ? "Openen in de browser" : french ? "Ouvrir dans le navigateur" : "Open in the browser"),
                folder = new JButton(dutch ? "Gegevensmap" : french ? "Dossier des données" : "Data folder"),
                stop = new JButton(dutch ? "Stoppen" : french ? "Arrêter" : "Stop");
        open.addActionListener(event -> mode.openBrowser());
        folder.addActionListener(event -> {
            try {
                Desktop.getDesktop().open(data.toFile());
            } catch (Exception ignored) {
                // no file manager: the path is in the log
            }
        });
        Runnable quit = () -> {
            frame.dispose();
            System.exit(SpringApplication.exit(context));
        };
        stop.addActionListener(event -> quit.run());
        frame.addWindowListener(new java.awt.event.WindowAdapter() {
            @Override
            public void windowClosing(java.awt.event.WindowEvent event) {
                quit.run();
            }
        });
        JPanel buttons = new JPanel(new FlowLayout(FlowLayout.RIGHT));
        buttons.add(folder);
        buttons.add(stop);
        buttons.add(open);
        frame.getContentPane().add(label, BorderLayout.CENTER);
        frame.getContentPane().add(buttons, BorderLayout.SOUTH);
        frame.pack();
        frame.setLocationByPlatform(true);
        frame.setVisible(true);
        frame.getRootPane().setDefaultButton(open);
    }
}
