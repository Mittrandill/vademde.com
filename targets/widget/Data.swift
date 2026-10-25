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
    /// bank_code (features/banks/banks.ts); widget'ta "bank_<kod>" görseli. Eski özetlerde yok.
    let bank: String?
}

struct Snapshot: Codable {
    // Optional to keep snapshots written by previous app builds decodable.
    let language: String?
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
    let language: WidgetLanguage
}

struct VademdeProvider: TimelineProvider {
    func placeholder(in context: Context) -> VademdeEntry {
        let language = WidgetLanguage.current
        return VademdeEntry(date: Date(), snapshot: Snapshot.sample(for: language), hideAmounts: false, language: language)
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
        let language = WidgetLanguage.current
        var snapshot: Snapshot? = nil
        if let json = defaults?.string(forKey: "snapshot"), let data = json.data(using: .utf8) {
            snapshot = try? JSONDecoder().decode(Snapshot.self, from: data)
        }
        if let saved = snapshot, (saved.language ?? "tr") != language.rawValue { snapshot = nil }
        let hide = defaults?.string(forKey: "hideAmounts") == "1"
        return VademdeEntry(date: Date(), snapshot: snapshot, hideAmounts: hide, language: language)
    }
}

private func sampleDay(_ offset: Int) -> String {
    let f = DateFormatter()
    f.locale = Locale(identifier: "en_US_POSIX")
    f.dateFormat = "yyyy-MM-dd"
    return f.string(from: Calendar.current.date(byAdding: .day, value: offset, to: Date())!)
}

extension Snapshot {
    static func sample(for language: WidgetLanguage) -> Snapshot {
        let english = language == .en
        return Snapshot(
        language: language.rawValue,
        workspaceName: english ? "Kaya Furniture" : "Kaya Mobilya", balance: english ? "₺99,521" : "₺99.521", receivable: english ? "₺18,000" : "₺18.000", payable: english ? "₺101,590" : "₺101.590",
        monthNet: english ? "₺35,200" : "₺35.200", monthNetShort: "+35K", weekPayable: english ? "₺48,250" : "₺48.250", weekReceivable: english ? "₺18,000" : "₺18.000",
        weekPayableMinor: 4_825_000, weekReceivableMinor: 1_800_000,
        items: [
            DueItem(title: "Enerjisa", kind: english ? "Invoice" : "Fatura", date: sampleDay(-3), amount: english ? "₺2,184.60" : "₺2.184,60", receivable: false, overdue: true, bank: nil),
            DueItem(title: english ? "North Logistics" : "Kuzey Lojistik", kind: english ? "Cheque" : "Çek", date: sampleDay(1), amount: english ? "₺48,250" : "₺48.250", receivable: false, overdue: false, bank: "akbank"),
            DueItem(title: english ? "Anatolia Packaging" : "Anadolu Ambalaj", kind: english ? "Promissory Note" : "Senet", date: sampleDay(4), amount: english ? "₺18,000" : "₺18.000", receivable: true, overdue: false, bank: nil),
            DueItem(title: english ? "Home loan" : "Konut kredisi", kind: english ? "Loan" : "Kredi", date: sampleDay(7), amount: english ? "₺14,872" : "₺14.872", receivable: false, overdue: false, bank: "turkiye-garanti-bankasi"),
        ])
    }
}

// MARK: - Tarih yardımcıları

private let dayKeyFormatter: DateFormatter = {
    let f = DateFormatter()
    f.calendar = Calendar.current
    f.locale = Locale(identifier: "en_US_POSIX")
    f.dateFormat = "yyyy-MM-dd"
    return f
}()

private func shortDateFormatter(language: WidgetLanguage) -> DateFormatter {
    let f = DateFormatter()
    f.locale = language.locale
    f.dateFormat = language == .en ? "MMM d" : "d MMM"
    return f
}

extension DueItem {
    /// Bugüne göre gün farkı (negatif = gecikmiş). Örnek veride bugüne göre kaydırılır.
    func days(from now: Date) -> Int {
        guard let due = dayKeyFormatter.date(from: date) else { return 0 }
        let cal = Calendar.current
        return cal.dateComponents([.day], from: cal.startOfDay(for: now), to: cal.startOfDay(for: due)).day ?? 0
    }

    func shortDate(language: WidgetLanguage) -> String {
        guard let due = dayKeyFormatter.date(from: date) else { return "" }
        return shortDateFormatter(language: language).string(from: due)
    }

    /// "Bugün" / "Yarın" / "N gün" / "N gün gecikti"
    func relative(from now: Date, language: WidgetLanguage) -> String {
        let d = days(from: now)
        if overdue || d < 0 { return language.daysOverdue(max(1, abs(d))) }
        if d == 0 { return language.text(.today) }
        if d == 1 { return language.text(.tomorrow) }
        return language.daysRemaining(d)
    }

    /// Satırın sol sütunu: gecikmişte/yakında "Yarın", aksi halde "9 Eki".
    func dateLabel(from now: Date, language: WidgetLanguage) -> String {
        let d = days(from: now)
        if d == 0 && !overdue { return language.text(.today) }
        if d == 1 { return language.text(.tomorrow) }
        return shortDate(language: language)
    }
}
