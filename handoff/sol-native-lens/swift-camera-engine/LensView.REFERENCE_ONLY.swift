import SwiftUI

struct LensView: View {
    let job: Job
    var initialLabel: String = ""
    @EnvironmentObject private var queue: PhotoQueue
    @Environment(\.dismiss) private var dismiss

    @StateObject private var camera = CameraSession()
    @StateObject private var gps = LocationFix()
    @State private var settings = WatermarkSettings.load()
    @State private var label = ""
    @State private var labelLocked = false
    @State private var showSettings = false
    @State private var showLabelPrompt = false
    @State private var pendingImage: UIImage?
    @State private var capturing = false
    @State private var flash = false
    @State private var sessionCount = 0
    @State private var lastThumb: UIImage?
    @State private var notice: String?
    @State private var clock = Date()

    private let sessionMax = 10
    private let tick = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    var body: some View {
        ZStack {
            Color.black.ignoresSafeArea()
            CameraPreview(session: camera.session)
                .ignoresSafeArea()

            liveStamp
                .allowsHitTesting(false)

            if flash {
                Color.white.opacity(0.7).ignoresSafeArea()
            }

            VStack {
                topBar
                Spacer()
                bottomBar
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 28)

            if showSettings { settingsSheet }
            if showLabelPrompt { labelPrompt }
            if let err = camera.error {
                errorBanner(err)
            }
            if let notice {
                errorBanner(notice)
            }
        }
        .onAppear {
            camera.start()
            gps.start()
            label = UserDefaults.standard.string(forKey: "iwb_last_label_\(job.id)") ?? ""
            if label.isEmpty, !initialLabel.isEmpty {
                label = initialLabel
            }
        }
        .onDisappear {
            camera.stop()
            gps.stop()
        }
        .onReceive(tick) { clock = $0 }
        .statusBarHidden(true)
    }

    private var liveLines: (String, String) {
        settings.lines(jobName: job.name, label: label, coordinate: gps.coordinate, now: clock)
    }

    private var liveStamp: some View {
        VStack {
            Spacer()
            HStack {
                if settings.orientation != "-90" {
                    stampCard
                    Spacer()
                } else {
                    Spacer()
                    stampCard
                        .rotationEffect(.degrees(-90), anchor: .bottomTrailing)
                }
            }
            .padding(18)
            .padding(.bottom, 96)
        }
    }

    private var stampCard: some View {
        let lines = liveLines
        return VStack(alignment: .leading, spacing: 4) {
            if !lines.0.isEmpty {
                Text(lines.0)
                    .font(.system(size: 13, weight: .bold))
            }
            if !lines.1.isEmpty {
                Text(lines.1)
                    .font(.system(size: 12, weight: .semibold))
                    .lineLimit(2)
            }
        }
        .foregroundStyle(.white)
        .padding(.horizontal, 10)
        .padding(.vertical, 8)
        .background(.black.opacity(0.65), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
        .opacity((lines.0.isEmpty && lines.1.isEmpty) ? 0 : 1)
    }

    private var topBar: some View {
        HStack {
            Button { dismiss() } label: {
                Image(systemName: "chevron.left")
                    .font(.title3.weight(.semibold))
                    .padding(10)
                    .background(.black.opacity(0.45), in: Circle())
            }
            VStack(alignment: .leading, spacing: 2) {
                Text(job.name)
                    .font(.subheadline.weight(.semibold))
                    .lineLimit(1)
                Text(queue.isOnline ? "Live · \(gps.status)" : "Offline · \(gps.status)")
                    .font(.caption2)
                    .foregroundStyle(.white.opacity(0.7))
            }
            Spacer()
            Button { camera.toggleTorch() } label: {
                Image(systemName: camera.torchOn ? "bolt.fill" : "bolt.slash")
                    .padding(10)
                    .background(.black.opacity(0.45), in: Circle())
            }
            Button { showSettings = true } label: {
                Image(systemName: "gearshape")
                    .padding(10)
                    .background(.black.opacity(0.45), in: Circle())
            }
        }
        .foregroundStyle(.white)
    }

    private var bottomBar: some View {
        HStack(alignment: .center) {
            thumbnail
            Spacer()
            Button(action: shutter) {
                ZStack {
                    Circle().stroke(.white, lineWidth: 4).frame(width: 76, height: 76)
                    Circle().fill(.white).frame(width: 62, height: 62)
                    if capturing {
                        ProgressView().tint(.black)
                    }
                }
            }
            .disabled(capturing || sessionCount >= sessionMax)
            Spacer()
            VStack(spacing: 6) {
                Button { camera.flip() } label: {
                    Image(systemName: "camera.rotate")
                        .padding(10)
                        .background(.black.opacity(0.45), in: Circle())
                }
                Text("\(sessionCount)/\(sessionMax)")
                    .font(.caption2.monospacedDigit())
            }
            .foregroundStyle(.white)
            .frame(width: 56)
        }
    }

    private var thumbnail: some View {
        Group {
            if let lastThumb {
                Image(uiImage: lastThumb)
                    .resizable()
                    .scaledToFill()
            } else {
                Color.white.opacity(0.12)
            }
        }
        .frame(width: 44, height: 44)
        .clipShape(RoundedRectangle(cornerRadius: 8))
        .overlay {
            let n = queue.pending(for: job.id).count
            if n > 0 {
                Text("\(n)")
                    .font(.caption2.bold())
                    .padding(4)
                    .background(Color.orange, in: Circle())
                    .offset(x: 16, y: -16)
            }
        }
    }

    private func shutter() {
        if sessionCount >= sessionMax {
            notice = "Session limit \(sessionMax) shots. Close and reopen the lens."
            return
        }
        if settings.showLabel && !labelLocked && label.trimmingCharacters(in: .whitespaces).isEmpty {
            Task { await captureThenPrompt() }
            return
        }
        Task { await captureAndSave(labelOverride: label) }
    }

    private func captureThenPrompt() async {
        capturing = true
        do {
            pendingImage = try await camera.capture()
            showLabelPrompt = true
        } catch {
            notice = error.localizedDescription
        }
        capturing = false
    }

    private func captureAndSave(labelOverride: String) async {
        capturing = true
        flash = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.12) { flash = false }
        do {
            let frame = try await camera.capture()
            try persist(image: frame, label: labelOverride)
        } catch {
            notice = error.localizedDescription
        }
        capturing = false
    }

    private func persist(image: UIImage, label: String) throws {
        guard let jpeg = WatermarkComposer.bake(image: image, settings: settings, jobName: job.name, label: label, coordinate: gps.coordinate) else {
            notice = "Could not stamp this frame. Nothing uploaded."
            return
        }
        _ = try queue.enqueue(jobId: job.id, jpeg: jpeg, label: label)
        lastThumb = UIImage(data: jpeg)
        sessionCount += 1
        UserDefaults.standard.set(label, forKey: "iwb_last_label_\(job.id)")
    }

    private var labelPrompt: some View {
        Color.black.opacity(0.55).ignoresSafeArea().overlay {
            VStack(alignment: .leading, spacing: 12) {
                Text("Shot label")
                    .font(.headline)
                TextField("e.g. Slab / North wall", text: $label, axis: .vertical)
                    .textFieldStyle(.roundedBorder)
                    .lineLimit(2...4)
                Toggle("Lock label for this session", isOn: $labelLocked)
                HStack {
                    Button("Cancel") {
                        pendingImage = nil
                        showLabelPrompt = false
                    }
                    Spacer()
                    Button("Stamp") {
                        let image = pendingImage
                        showLabelPrompt = false
                        pendingImage = nil
                        if let image {
                            try? persist(image: image, label: label)
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(Color(red: 0.93, green: 0.45, blue: 0.12))
                }
            }
            .padding(20)
            .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 18))
            .padding(28)
        }
    }

    private var settingsSheet: some View {
        Color.black.opacity(0.55).ignoresSafeArea().overlay(alignment: .bottom) {
            VStack(alignment: .leading, spacing: 14) {
                HStack {
                    Text("Watermark").font(.headline)
                    Spacer()
                    Button("Done") {
                        settings.save()
                        showSettings = false
                    }
                }
                Toggle("Job name", isOn: $settings.showJobName)
                Toggle("Date", isOn: $settings.showDate)
                Toggle("Time", isOn: $settings.showTime)
                Toggle("GPS", isOn: $settings.showGps)
                Toggle("Label", isOn: $settings.showLabel)
                Picker("Strip", selection: $settings.orientation) {
                    Text("Bottom left").tag("0")
                    Text("Vertical −90°").tag("-90")
                }
                .pickerStyle(.segmented)
            }
            .padding(20)
            .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 22, style: .continuous))
            .padding()
            .onChange(of: settings) { _, v in v.save() }
        }
    }

    private func errorBanner(_ text: String) -> some View {
        VStack {
            Text(text)
                .font(.subheadline)
                .padding()
                .frame(maxWidth: .infinity)
                .background(Color.red.opacity(0.85))
                .onTapGesture { notice = nil }
            Spacer()
        }
        .allowsHitTesting(true)
    }
}
