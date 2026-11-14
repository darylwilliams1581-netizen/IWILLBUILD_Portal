import SwiftUI

struct EndTripSheet: View {
    let vehicleName: String
    let startDate: Date
    let endDate: Date
    let startLocation: String
    let endLocation: String
    let km: Double
    var onConfirm: (_ businessOrPrivate: String, _ purpose: String, _ reason: String?, _ prestartAtHome: Bool) -> Void
    var onCancel: () -> Void

    @State private var businessOrPrivate: String = "business"
    @State private var purpose: String = TripPurposes.all.first ?? "Travel to site"
    @State private var reason: String = ""
    @State private var prestartAtHome: Bool = false

    private let purposes = TripPurposes.all

    var body: some View {
        NavigationStack {
            Form {
                Section("Trip summary") {
                    LabeledContent("Vehicle", value: vehicleName)
                    LabeledContent("Start", value: startDate.formatted(date: .abbreviated, time: .shortened))
                    LabeledContent("End", value: endDate.formatted(date: .abbreviated, time: .shortened))
                    LabeledContent("Start location", value: startLocation)
                    LabeledContent("End location", value: endLocation)
                    LabeledContent("Distance", value: String(format: "%.1f km", km))
                }

                Section("Purpose") {
                    Picker("Type", selection: $businessOrPrivate) {
                        Text("Business").tag("business")
                        Text("Private").tag("private")
                    }
                    .pickerStyle(.segmented)

                    Toggle("Pre-start completed at home", isOn: $prestartAtHome)
                        .onChange(of: prestartAtHome) { _, newValue in
                            if newValue {
                                purpose = "Travel to site (pre-start completed at home)"
                            }
                        }

                    Picker("Purpose", selection: $purpose) {
                        ForEach(purposes, id: \.self) { p in
                            Text(p).tag(p)
                        }
                    }

                    if purpose == "Other" {
                        TextField("Reason", text: $reason, axis: .vertical)
                            .lineLimit(2...4)
                    }
                }
            }
            .navigationTitle("End Trip")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel", action: onCancel)
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        let finalReason = purpose == "Other" ? (reason.isEmpty ? nil : reason) : nil
                        onConfirm(businessOrPrivate, purpose, finalReason, prestartAtHome)
                    }
                    .disabled(purpose == "Other" && reason.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
        }
    }
}

enum TripPurposes {
    static let all: [String] = [
        "Travel to site",
        "Travel from site",
        "Travel between sites",
        "Site work / on site",
        "Travel to site (pre-start completed at home)",
        "Client meeting",
        "Supplier / materials pickup",
        "Office / depot",
        "Other"
    ]
}

#Preview {
    EndTripSheet(
        vehicleName: "Mazda BT-50",
        startDate: Date().addingTimeInterval(-3600),
        endDate: Date(),
        startLocation: "Home",
        endLocation: "Site",
        km: 42.5,
        onConfirm: { _, _, _, _ in },
        onCancel: {}
    )
}
