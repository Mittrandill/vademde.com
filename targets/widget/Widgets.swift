import WidgetKit
import SwiftUI

private let openList = URL(string: "vademde:///obligations")!
private let openCalendar = URL(string: "vademde:///takvim")!
private let openScan = URL(string: "vademde:///tara")!

// MARK: - Küçük · Sıradaki vade

struct NextDueView: View {
    let entry: VademdeEntry
    var body: some View {
        Group {
            if let item = entry.snapshot?.next {
                let tint: Color = item.overdue ? VT.bad : VT.brandText
                VStack(alignment: .leading, spacing: 0) {
                    HStack {
                        Image(systemName: item.receivable ? "arrow.down.left" : "arrow.up.right")
                            .font(.system(size: 13, weight: .bold))
                            .foregroundColor(item.receivable ? VT.ok : VT.violet)
                        Spacer()
                        Chip(text: item.relative(from: entry.date), tint: tint)
                    }
                    Spacer(minLength: 4)
                    Text("Sıradaki vade").font(.system(size: 11, weight: .semibold)).foregroundColor(VT.text2)
                    Text(money(item.amount, hidden: entry.hideAmounts))
                        .font(.system(size: 22, weight: .bold)).foregroundColor(VT.text)
                        .minimumScaleFactor(0.6).lineLimit(1)
                    Text("\(item.title) · \(item.kind.lowercased())")
                        .font(.system(size: 12)).foregroundColor(VT.text2).lineLimit(1)
                }
            } else {
                EmptyState()
            }
        }
        .widgetURL(openList)
        .homeBackground()
    }
}

struct NextDueWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "VademdeNextDue", provider: VademdeProvider()) { NextDueView(entry: $0) }
            .configurationDisplayName("Sıradaki vade")
            .description("En yakın kayıt ve kalan gün.")
            .supportedFamilies([.systemSmall])
    }
}

// MARK: - Küçük · Bu hafta

struct WeekView: View {
    let entry: VademdeEntry
    var body: some View {
        Group {
            if let s = entry.snapshot {
                let total = max(s.weekPayableMinor + s.weekReceivableMinor, 1)
                let payShare = s.weekPayableMinor / total
                VStack(alignment: .leading, spacing: 0) {
                    Text("Bu hafta").font(.system(size: 11, weight: .semibold)).foregroundColor(VT.text2)
                    VStack(alignment: .leading, spacing: 1) {
                        Text("Ödenecek").font(.system(size: 11)).foregroundColor(VT.text2)
                        Text(money(s.weekPayable, hidden: entry.hideAmounts))
                            .font(.system(size: 17, weight: .bold)).foregroundColor(VT.text)
                            .minimumScaleFactor(0.6).lineLimit(1)
                    }.padding(.top, 8)
                    VStack(alignment: .leading, spacing: 1) {
                        Text("Tahsil edilecek").font(.system(size: 11)).foregroundColor(VT.text2)
                        Text(money(s.weekReceivable, hidden: entry.hideAmounts))
                            .font(.system(size: 17, weight: .bold)).foregroundColor(VT.ok)
                            .minimumScaleFactor(0.6).lineLimit(1)
                    }.padding(.top, 8)
                    Spacer(minLength: 4)
                    GeometryReader { geo in
                        HStack(spacing: 0) {
                            Rectangle().fill(VT.text2).frame(width: geo.size.width * payShare)
                            Rectangle().fill(VT.ok)
                        }
                        .clipShape(Capsule())
                    }
                    .frame(height: 5)
                    .opacity(entry.hideAmounts || s.weekPayableMinor + s.weekReceivableMinor == 0 ? 0.35 : 1)
                }
            } else {
                EmptyState()
            }
        }
        .widgetURL(openCalendar)
        .homeBackground()
    }
}

struct WeekWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "VademdeWeek", provider: VademdeProvider()) { WeekView(entry: $0) }
            .configurationDisplayName("Bu hafta")
            .description("Önümüzdeki 7 günde ödenecek ve tahsil edilecek tutar.")
            .supportedFamilies([.systemSmall])
    }
}

// MARK: - Orta · Yaklaşan vadeler

struct DueRowView: View {
    let item: DueItem
    let now: Date
    let hidden: Bool
    var body: some View {
        let dateColor: Color = item.overdue ? VT.bad : (item.days(from: now) <= 1 ? VT.brandText : VT.text2)
        HStack(spacing: 10) {
            Text(item.dateLabel(from: now))
                .font(.system(size: 13, weight: .bold)).foregroundColor(dateColor)
                .frame(width: 44, alignment: .leading).lineLimit(1).minimumScaleFactor(0.8)
            Text("\(item.title) · \(item.overdue ? "gecikti" : item.kind.lowercased())")
                .font(.system(size: 13)).foregroundColor(VT.text2).lineLimit(1)
            Spacer(minLength: 4)
            Text(money((item.receivable ? "+" : "") + item.amount, hidden: hidden))
                .font(.system(size: 13, weight: .semibold))
                .foregroundColor(item.receivable ? VT.ok : VT.text).lineLimit(1)
        }
    }
}

struct UpcomingView: View {
    let entry: VademdeEntry
    var body: some View {
        Group {
            if let s = entry.snapshot, !s.items.isEmpty {
                VStack(alignment: .leading, spacing: 0) {
                    Text("Yaklaşan vadeler").font(.system(size: 11, weight: .semibold)).foregroundColor(VT.text2)
                    VStack(alignment: .leading, spacing: 8) {
                        ForEach(Array(s.items.prefix(3).enumerated()), id: \.offset) { _, item in
                            DueRowView(item: item, now: entry.date, hidden: entry.hideAmounts)
                        }
                    }.padding(.top, 12)
                    Spacer(minLength: 0)
                }
            } else if entry.snapshot != nil {
                VStack(alignment: .leading) {
                    Text("Yaklaşan vadeler").font(.system(size: 11, weight: .semibold)).foregroundColor(VT.text2)
                    Spacer()
                    Text("Açık vade yok").font(.system(size: 15, weight: .semibold)).foregroundColor(VT.text)
                    Spacer()
                }.frame(maxWidth: .infinity, alignment: .leading)
            } else {
                EmptyState()
            }
        }
        .widgetURL(openCalendar)
        .homeBackground()
    }
}

struct UpcomingWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "VademdeUpcoming", provider: VademdeProvider()) { UpcomingView(entry: $0) }
            .configurationDisplayName("Yaklaşan vadeler")
            .description("En yakın 3 vadeli kayıt.")
            .supportedFamilies([.systemMedium])
    }
}

// MARK: - Büyük · Özet ve tarama

struct SummaryView: View {
    let entry: VademdeEntry
    var body: some View {
        Group {
            if let s = entry.snapshot {
                VStack(alignment: .leading, spacing: 0) {
                    HStack {
                        Text(s.workspaceName).font(.system(size: 11, weight: .semibold))
                            .foregroundColor(VT.text2).lineLimit(1)
                        Spacer()
                        Link(destination: openScan) {
                            HStack(spacing: 4) {
                                Image(systemName: "viewfinder").font(.system(size: 12, weight: .semibold))
                                Text("Tara").font(.system(size: 12, weight: .semibold))
                            }
                            .foregroundColor(VT.onBrand)
                            .padding(.horizontal, 10).frame(height: 28)
                            .background(VT.brand).clipShape(Capsule())
                        }
                    }
                    Text("Toplam bakiye").font(.system(size: 11)).foregroundColor(VT.text2).padding(.top, 8)
                    Text(money(s.balance, hidden: entry.hideAmounts))
                        .font(.system(size: 30, weight: .bold)).foregroundColor(VT.text)
                        .minimumScaleFactor(0.6).lineLimit(1)
                    HStack(spacing: 16) {
                        (Text("Alacak ").foregroundColor(VT.text2) + Text(money(s.receivable, hidden: entry.hideAmounts)).foregroundColor(VT.ok).fontWeight(.semibold))
                        (Text("Borç ").foregroundColor(VT.text2) + Text(money(s.payable, hidden: entry.hideAmounts)).foregroundColor(VT.text).fontWeight(.semibold))
                    }
                    .font(.system(size: 11)).padding(.top, 8).lineLimit(1)
                    Rectangle().fill(VT.separator).frame(height: 1).padding(.top, 12)
                    VStack(alignment: .leading, spacing: 10) {
                        ForEach(Array(s.items.prefix(4).enumerated()), id: \.offset) { _, item in
                            HStack(spacing: 10) {
                                Image(systemName: item.receivable ? "arrow.down.left" : "arrow.up.right")
                                    .font(.system(size: 11, weight: .bold))
                                    .foregroundColor(item.receivable ? VT.ok : VT.violet)
                                    .frame(width: 22, height: 22).background(VT.text2.opacity(0.12)).clipShape(Circle())
                                Text("\(item.title) · \(item.relative(from: entry.date).lowercased())")
                                    .font(.system(size: 13)).foregroundColor(item.overdue ? VT.bad : VT.text2).lineLimit(1)
                                Spacer(minLength: 4)
                                Text(money(item.amount, hidden: entry.hideAmounts))
                                    .font(.system(size: 13, weight: .semibold)).foregroundColor(VT.text).lineLimit(1)
                            }
                        }
                    }.padding(.top, 12)
                    Spacer(minLength: 0)
                }
            } else {
                EmptyState()
            }
        }
        .widgetURL(openList)
        .homeBackground()
    }
}

struct SummaryWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "VademdeSummary", provider: VademdeProvider()) { SummaryView(entry: $0) }
            .configurationDisplayName("Özet ve tarama")
            .description("Bakiye, 4 vade ve Tara kısayolu.")
            .supportedFamilies([.systemLarge])
    }
}

// MARK: - Kilit ekranı

struct LockDaysView: View {
    let entry: VademdeEntry
    var body: some View {
        ZStack {
            AccessoryWidgetBackground()
            if let item = entry.snapshot?.next {
                let d = item.days(from: entry.date)
                VStack(spacing: 0) {
                    Text(item.overdue || d < 0 ? "!" : "\(d)").font(.system(size: 20, weight: .bold))
                    Text(item.overdue || d < 0 ? "GECİKTİ" : "GÜN").font(.system(size: 9, weight: .semibold))
                        .minimumScaleFactor(0.7)
                }
            } else {
                Image(systemName: "calendar")
            }
        }
        .widgetURL(openList)
        .lockBackground()
    }
}

struct LockDaysWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "VademdeLockDays", provider: VademdeProvider()) { LockDaysView(entry: $0) }
            .configurationDisplayName("Kalan gün")
            .description("Sıradaki vadeye kaç gün kaldığı.")
            .supportedFamilies([.accessoryCircular])
    }
}

struct LockNextView: View {
    let entry: VademdeEntry
    var body: some View {
        Group {
            if let item = entry.snapshot?.next {
                VStack(alignment: .leading, spacing: 1) {
                    Text("SIRADAKİ VADE").font(.system(size: 11, weight: .bold)).opacity(0.8)
                    Text(money(item.amount, hidden: entry.hideAmounts)).font(.system(size: 16, weight: .bold))
                        .minimumScaleFactor(0.7).lineLimit(1)
                    Text("\(item.title) · \(item.relative(from: entry.date).lowercased())")
                        .font(.system(size: 12)).opacity(0.85).lineLimit(1)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            } else {
                Text("Vademde’yi açın").font(.system(size: 13))
            }
        }
        .widgetURL(openList)
        .lockBackground()
    }
}

struct LockNextWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "VademdeLockNext", provider: VademdeProvider()) { LockNextView(entry: $0) }
            .configurationDisplayName("Sıradaki vade")
            .description("Tutar ve kayıt adı.")
            .supportedFamilies([.accessoryRectangular])
    }
}

struct LockNetView: View {
    let entry: VademdeEntry
    var body: some View {
        ZStack {
            AccessoryWidgetBackground()
            if let s = entry.snapshot {
                VStack(spacing: 0) {
                    Text("BU AY").font(.system(size: 9, weight: .bold)).opacity(0.8)
                    Text(entry.hideAmounts ? "•••" : s.monthNetShort).font(.system(size: 15, weight: .bold))
                        .minimumScaleFactor(0.6).lineLimit(1)
                    Text("NET").font(.system(size: 9, weight: .semibold)).opacity(0.8)
                }
            } else {
                Image(systemName: "chart.line.uptrend.xyaxis")
            }
        }
        .widgetURL(URL(string: "vademde:///reports")!)
        .lockBackground()
    }
}

struct LockNetWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "VademdeLockNet", provider: VademdeProvider()) { LockNetView(entry: $0) }
            .configurationDisplayName("Bu ay net")
            .description("Bu ayın gelir − gider farkı.")
            .supportedFamilies([.accessoryCircular])
    }
}
