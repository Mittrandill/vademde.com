import WidgetKit
import SwiftUI

@main
struct VademdeWidgetBundle: WidgetBundle {
    var body: some Widget {
        NextDueWidget()
        WeekWidget()
        UpcomingWidget()
        SummaryWidget()
        LockDaysWidget()
        LockNextWidget()
        LockInlineWidget()
        LockNetWidget()
    }
}
