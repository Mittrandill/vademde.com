import Foundation

enum WidgetLanguage: String {
    case tr, en

    static var current: WidgetLanguage {
        let stored = UserDefaults(suiteName: vademdeAppGroup)?.string(forKey: "language")
        if let stored, let language = WidgetLanguage(rawValue: stored) { return language }
        let device = Locale(identifier: Locale.preferredLanguages.first ?? "en").languageCode
        return device == "tr" ? .tr : .en
    }

    var locale: Locale { Locale(identifier: self == .en ? "en_US" : "tr_TR") }

    func daysRemaining(_ count: Int) -> String {
        self == .en ? "in \(count) \(count == 1 ? "day" : "days")" : "\(count) gün"
    }

    func daysOverdue(_ count: Int) -> String {
        self == .en ? "\(count) \(count == 1 ? "day" : "days") overdue" : "\(count) gün gecikti"
    }

    func dayCaption(_ count: Int) -> String {
        self == .en ? (count == 1 ? "DAY" : "DAYS") : "GÜN"
    }

    func text(_ key: WidgetText) -> String {
        switch key {
        case .nextDue: return self == .en ? "Next due" : "Sıradaki vade"
        case .nextDueDescription: return self == .en ? "The nearest record and days remaining." : "En yakın kayıt ve kalan gün."
        case .thisWeek: return self == .en ? "This week" : "Bu hafta"
        case .weekDescription: return self == .en ? "Amounts to pay and collect in the next 7 days." : "Önümüzdeki 7 günde ödenecek ve tahsil edilecek tutar."
        case .toPay: return self == .en ? "To pay" : "Ödenecek"
        case .toCollect: return self == .en ? "To collect" : "Tahsil edilecek"
        case .upcoming: return self == .en ? "Upcoming due dates" : "Yaklaşan vadeler"
        case .upcomingDescription: return self == .en ? "The nearest 3 scheduled records." : "En yakın 3 vadeli kayıt."
        case .noOpenDue: return self == .en ? "No open due dates" : "Açık vade yok"
        case .scan: return self == .en ? "Scan" : "Tara"
        case .balance: return self == .en ? "Total balance" : "Toplam bakiye"
        case .receivable: return self == .en ? "Receivable " : "Alacak "
        case .payable: return self == .en ? "Payable " : "Borç "
        case .summary: return self == .en ? "Summary and scan" : "Özet ve tarama"
        case .summaryDescription: return self == .en ? "Balance, 4 due dates and a Scan shortcut." : "Bakiye, 4 vade ve Tara kısayolu."
        case .daysLeft: return self == .en ? "Days left" : "Kalan gün"
        case .daysDescription: return self == .en ? "Days until the next due date." : "Sıradaki vadeye kaç gün kaldığı."
        case .nextDueUpper: return self == .en ? "NEXT DUE" : "SIRADAKİ VADE"
        case .amountAndName: return self == .en ? "The amount and record name." : "Tutar ve kayıt adı."
        case .aboveClock: return self == .en ? "Above the clock" : "Saatin üstünde"
        case .inlineDescription: return self == .en ? "The next due date in a single line." : "Sıradaki vade tek satırda."
        case .thisMonth: return self == .en ? "This month net" : "Bu ay net"
        case .monthDescription: return self == .en ? "This month’s income minus expenses." : "Bu ayın gelir − gider farkı."
        case .thisMonthUpper: return self == .en ? "THIS MONTH" : "BU AY"
        case .netUpper: return "NET"
        case .openApp: return self == .en ? "Open Vademde" : "Vademde’yi açın"
        case .emptyBody: return self == .en ? "Your due dates will appear here" : "Vadeler burada görünecek"
        case .overdue: return self == .en ? "overdue" : "gecikti"
        case .overdueUpper: return self == .en ? "OVERDUE" : "GECİKTİ"
        case .today: return self == .en ? "Today" : "Bugün"
        case .tomorrow: return self == .en ? "Tomorrow" : "Yarın"
        }
    }
}

enum WidgetText {
    case nextDue, nextDueDescription, thisWeek, weekDescription, toPay, toCollect
    case upcoming, upcomingDescription, noOpenDue, scan, balance, receivable, payable
    case summary, summaryDescription, daysLeft, daysDescription, nextDueUpper, amountAndName
    case aboveClock, inlineDescription, thisMonth, monthDescription, thisMonthUpper, netUpper
    case openApp, emptyBody, overdue, overdueUpper, today, tomorrow
}
