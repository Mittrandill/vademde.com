import WidgetKit
import SwiftUI

// Uygulama (services/widgetSync.ts) bu anahtarlara App Group UserDefaults üzerinden yazar.
let vademdeAppGroup = "group.com.akintkaya.vademde.widget"

struct DueItem: Codable {
    let title: String
    let kind: String
    let date: String          // yyyy-MM-dd (yerel gün)
    let amount: String
    let receivable: Bool
    let overdue: Bool
}

struct Snapshot: Codable {
    let workspaceName: String
    let balance: String
    let receivable: String
    let payable: String
    let monthNet: String
    let monthNetShort: String
    let weekPayable: String
    let weekReceivable: String
    let weekPayableMinor: Double
    let weekReceivableMinor: Double
    let items: [DueItem]
}

struct VademdeEntry: TimelineEntry {
    let date: Date
    let snapshot: Snapshot?
    let hideAmounts: Bool
}

struct VademdeProvider: TimelineProvider {
    func placeholder(in context: Context) -> VademdeEntry {
        VademdeEntry(date: Date(), snapshot: Snapshot.sample, hideAmounts: false)
    }

    func getSnapshot(in context: Context, completion: @escaping (VademdeEntry) -> Void) {
        completion(context.isPreview ? placeholder(in: context) : load())
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<VademdeEntry>) -> Void) {
        // Kalan gün sayıları gece yarısı değişir; uygulama veri yazdıkça zaten yenilenir.
        let cal = Calendar.current
        let nextMidnight = cal.date(byAdding: .minute, value: 1, to: cal.startOfDay(for: cal.date(byAdding: .day, value: 1, to: Date())!))!
        completion(Timeline(entries: [load()], policy: .after(nextMidnight)))
    }

    private func load() -> VademdeEntry {
        let defaults = UserDefaults(suiteName: vademdeAppGroup)
        var snapshot: Snapshot? = nil
        if let json = defaults?.string(forKey: "snapshot"), let data = json.data(using: .utf8) {
            snapshot = try? JSONDecoder().decode(Snapshot.self, from: data)
        }
        let hide = defaults?.string(forKey: "hideAmounts") == "1"
        return VademdeEntry(date: Date(), snapshot: snapshot, hideAmounts: hide)
    }
}

private func sampleDay(_ offset: Int) -> String {
    let f = DateFormatter()
    f.locale = Locale(identifier: "en_US_POSIX")
    f.dateFormat = "yyyy-MM-dd"
    return f.string(from: Calendar.current.date(byAdding: .day, value: offset, to: Date())!)
}

extension Snapshot {
    static var sample = Snapshot(
        workspaceName: "Kaya Mobilya", balance: "₺99.521", receivable: "₺18.000", payable: "₺101.590",
        monthNet: "₺35.200", monthNetShort: "+35K", weekPayable: "₺48.250", weekReceivable: "₺18.000",
        weekPayableMinor: 4_825_000, weekReceivableMinor: 1_800_000,
        items: [
            DueItem(title: "Enerjisa", kind: "Fatura", date: sampleDay(-3), amount: "₺2.184,60", receivable: false, overdue: true),
            DueItem(title: "Kuzey Lojistik", kind: "Çek", date: sampleDay(1), amount: "₺48.250", receivable: false, overdue: false),
            DueItem(title: "Anadolu Ambalaj", kind: "Senet", date: sampleDay(4), amount: "₺18.000", receivable: true, overdue: false),
            DueItem(title: "Konut kredisi", kind: "Kredi", date: sampleDay(7), amount: "₺14.872", receivable: false, overdue: false),
        ])
}

// MARK: - Tarih yardımcıları

private let dayKeyFormatter: DateFormatter = {
    let f = DateFormatter()
    f.calendar = Calendar.current
    f.locale = Locale(identifier: "en_US_POSIX")
    f.dateFormat = "yyyy-MM-dd"
    return f
}()

private let shortDateFormatter: DateFormatter = {
    let f = DateFormatter()
    f.locale = Locale(identifier: "tr_TR")
    f.dateFormat = "d MMM"
    return f
}()

extension DueItem {
    /// Bugüne göre gün farkı (negatif = gecikmiş). Örnek veride bugüne göre kaydırılır.
    func days(from now: Date) -> Int {
        guard let due = dayKeyFormatter.date(from: date) else { return 0 }
        let cal = Calendar.current
        return cal.dateComponents([.day], from: cal.startOfDay(for: now), to: cal.startOfDay(for: due)).day ?? 0
    }

    func shortDate() -> String {
        guard let due = dayKeyFormatter.date(from: date) else { return "" }
        return shortDateFormatter.string(from: due)
    }

    /// "Bugün" / "Yarın" / "N gün" / "N gün gecikti"
    func relative(from now: Date) -> String {
        let d = days(from: now)
        if overdue || d < 0 { return "\(max(1, abs(d))) gün gecikti" }
        if d == 0 { return "Bugün" }
        if d == 1 { return "Yarın" }
        return "\(d) gün"
    }

    /// Satırın sol sütunu: gecikmişte/yakında "Yarın", aksi halde "9 Eki".
    func dateLabel(from now: Date) -> String {
        let d = days(from: now)
        if d == 0 && !overdue { return "Bugün" }
        if d == 1 { return "Yarın" }
        return shortDate()
    }
}
