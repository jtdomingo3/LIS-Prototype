import { Component, inject, OnInit, OnDestroy, signal, computed, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ReportService, NavItem } from '../../../core/services/report.service';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

@Component({
  selector: 'app-report-list',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  template: `
    <div class="page-header">
      <h1>Report Preview</h1>
      <div class="actions">
        <a routerLink="/reports/worksheet" class="btn btn-secondary">📊 Worksheet Export</a>
      </div>
    </div>

    <!-- Filters & Navigation -->
    <div class="card filter-section">
      <div class="nav-row">
        <button class="btn btn-nav" [disabled]="!prevId()" (click)="goToPrev()">← Previous</button>
        <button class="btn btn-nav" [disabled]="!nextId()" (click)="goToNext()">Next →</button>

        <div class="search-group">
          <input type="text"
            class="form-control search-input"
            placeholder="Search by patient name, test ID..."
            [ngModel]="searchText()"
            (ngModelChange)="searchText.set($event); onFilterChange()" />
          <select class="form-control patient-select" [ngModel]="filterPatient()" (ngModelChange)="filterPatient.set($event); onFilterChange()">
            <option value="">-- All Patients --</option>
            @for (p of patients(); track p) {
              <option [value]="p">{{ p }}</option>
            }
          </select>
        </div>

        <div class="filter-group">
          <div class="dropdown-container" (click)="$event.stopPropagation()">
            <button class="btn btn-dropdown" (click)="testTypeDropdownOpen = !testTypeDropdownOpen">
              {{ selectedTestTypesLabel() }} ▾
            </button>
            @if (testTypeDropdownOpen) {
              <div class="dropdown-menu">
                <label class="dropdown-item">
                  <input type="checkbox" [checked]="allTestTypesSelected()" (change)="toggleAllTestTypes($event)" /> Select All
                </label>
                @for (t of testTypes(); track t) {
                  <label class="dropdown-item">
                    <input type="checkbox" [checked]="isTestTypeSelected(t)" (change)="toggleTestType(t)" /> {{ t }}
                  </label>
                }
              </div>
            }
          </div>
          <input type="date" class="form-control date-input" [ngModel]="filterDate()" (ngModelChange)="filterDate.set($event); onFilterChange()" />
          <button class="btn btn-secondary btn-sm-action" (click)="clearFilters()">Clear Filters</button>
          <button class="btn btn-print-filtered" (click)="printFiltered()">🖨 Print Filtered</button>
        </div>
      </div>

      <!-- Filtered counter + Select All -->
      <div class="filtered-section">
        <label class="select-all-label">
          <input type="checkbox" [checked]="allVisibleChecked()" (change)="toggleAllVisible($event)" />
          <strong>Select all visible</strong>
        </label>
        <div class="pager">{{ currentIndexDisplay() }} / {{ filteredItems().length }}</div>
      </div>
    </div>

    @if (loadingNav()) {
      <div class="loading">Loading reports...</div>
    } @else if (!currentItem()) {
      <div class="card" style="padding:2rem; text-align:center; color:#6b7280;">No completed reports found.</div>
    } @else {
      <!-- Action Buttons -->
      <div class="report-actions">
        <button class="btn btn-success" (click)="printReport()">🖨 Print / Save PDF</button>
      </div>

      <!-- Patient & Test Info -->
      <div class="card info-card">
        <div class="info-row">
          <div class="info-section">
            <strong>Patient Information</strong>
            <div>Name: {{ currentItem()!.patientName }}</div>
            <div>Patient ID: {{ currentItem()!.patientCode }}</div>
          </div>
          <div class="info-section">
            <strong>Test Information</strong>
            <div>Test ID: {{ currentItem()!.testId }}</div>
            <div>Test Type: <span class="text-teal">{{ currentItem()!.testType }}</span></div>
            <div>Date: <span class="text-teal">{{ currentItem()!.testDate | date:'dd/MM/yyyy' }}</span></div>
          </div>
          <div class="info-section">
            <strong>Results</strong>
          </div>
        </div>
      </div>

      <!-- Report iframe -->
      <div class="iframe-wrapper">
        @if (loadingHtml()) {
          <div class="loading">Loading report...</div>
        }
        <iframe
          #reportFrame
          [src]="iframeSrc()"
          frameborder="0"
          class="report-iframe"
          [class.hidden]="loadingHtml()"
          (load)="onIframeLoad()">
        </iframe>
      </div>
    }
  `,
  styles: [`
    .page-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem; }
    .page-header h1 { font-size: 1.25rem; font-weight: 600; margin: 0; }
    .filter-section { padding: 1rem; }

    .nav-row {
      display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: flex-start;
    }
    .btn-nav {
      padding: 8px 16px; font-weight: 600; background: #6b7280; color: white;
      border: none; border-radius: 4px; cursor: pointer;
    }
    .btn-nav:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-nav:hover:not(:disabled) { background: #4b5563; }

    .search-group {
      display: flex; flex-direction: column; gap: 0.4rem; flex: 1; min-width: 220px; max-width: 400px;
    }
    .search-input { width: 100%; }
    .patient-select { width: 100%; }

    .filter-group {
      display: flex; gap: 0.5rem; align-items: flex-start; flex-wrap: wrap; margin-left: auto;
    }

    .dropdown-container { position: relative; }
    .btn-dropdown {
      padding: 7px 14px; border: 1px solid #d1d5db; border-radius: 6px; background: white;
      cursor: pointer; white-space: nowrap; font-size: 0.875rem;
    }
    .dropdown-menu {
      position: absolute; top: 100%; left: 0; z-index: 100; min-width: 200px;
      background: white; border: 1px solid #d1d5db; border-radius: 6px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15); max-height: 280px; overflow-y: auto;
    }
    .dropdown-item {
      display: flex; align-items: center; gap: 6px; padding: 6px 12px; cursor: pointer;
      font-size: 0.85rem; white-space: nowrap;
    }
    .dropdown-item:hover { background: #f3f4f6; }

    .date-input { max-width: 160px; }

    .btn-sm-action {
      padding: 7px 14px; font-size: 0.85rem;
    }
    .btn-print-filtered {
      background: #1d4ed8; color: white; border: none; padding: 7px 14px;
      border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 0.85rem;
    }
    .btn-print-filtered:hover { background: #1e40af; }

    .btn-danger {
      background: #dc2626; color: white; border: none; padding: 7px 16px;
      border-radius: 6px; cursor: pointer; font-weight: 600;
    }
    .btn-danger:hover { background: #b91c1c; }
    .btn-success {
      background: #10b981; color: white; border: none; padding: 7px 16px;
      border-radius: 6px; cursor: pointer; font-weight: 600;
    }
    .btn-success:hover { background: #059669; }

    .filtered-section {
      display: flex; justify-content: space-between; align-items: center;
      padding-top: 0.75rem; margin-top: 0.75rem; border-top: 1px solid #e5e7eb;
    }
    .select-all-label {
      display: flex; align-items: center; gap: 0.5rem; font-size: 0.9rem; cursor: pointer;
    }
    .pager { font-weight: 600; color: #374151; font-size: 0.9rem; }

    .report-actions {
      display: flex; gap: 0.5rem; justify-content: flex-end; margin-bottom: 0.5rem;
    }

    .info-card { padding: 1rem 1.25rem; font-size: 0.9rem; line-height: 1.6; }
    .info-row { display: flex; gap: 2rem; flex-wrap: wrap; }
    .info-section { min-width: 200px; }
    .text-teal { color: #10b981; }

    .iframe-wrapper {
      background: #e5e7eb; border-radius: 6px; padding: 1rem;
      display: flex; justify-content: center; min-height: 600px; position: relative;
    }
    .report-iframe {
      width: 8.5in; min-height: 11in; background: white; border: none;
      box-shadow: 0 2px 12px rgba(0,0,0,0.15);
    }
    .report-iframe.hidden { opacity: 0; position: absolute; }

    .loading { text-align: center; padding: 3rem; color: #6b7280; }

    @media print {
      .page-header, .filter-section, .report-actions, .info-card { display: none !important; }
      .iframe-wrapper { background: none; padding: 0; }
      .report-iframe { box-shadow: none; width: 100%; min-height: 100vh; }
    }
  `]
})
export class ReportListComponent implements OnInit, OnDestroy {
  private reportService = inject(ReportService);
  private sanitizer = inject(DomSanitizer);

  @ViewChild('reportFrame') frameRef!: ElementRef<HTMLIFrameElement>;

  // Nav data
  allItems = signal<NavItem[]>([]);
  patients = signal<string[]>([]);
  testTypes = signal<string[]>([]);
  loadingNav = signal(true);

  // Filters
  searchText = signal('');
  filterPatient = signal('');
  filterDate = signal('');
  selectedTestTypes = signal<Set<string>>(new Set<string>());
  testTypeDropdownOpen = false;

  // Current state
  currentId = signal<string>('');
  loadingHtml = signal(false);
  iframeSrc = signal<SafeResourceUrl>('about:blank');
  private blobUrl: string | null = null;

  // Checked items (for Print Filtered)
  checkedIds = new Set<string>();

  // Computed — filtered list based on search/filters
  filteredItems = computed(() => {
    let items = this.allItems();
    const search = this.searchText().toLowerCase().trim();
    const patient = this.filterPatient();
    const date = this.filterDate();
    const types = this.selectedTestTypes();

    if (search) {
      items = items.filter(i =>
        i.patientName.toLowerCase().includes(search) ||
        i.testId.toLowerCase().includes(search) ||
        i.testType.toLowerCase().includes(search)
      );
    }
    if (patient) {
      items = items.filter(i => i.patientName === patient);
    }
    if (types.size > 0 && types.size < this.testTypes().length) {
      items = items.filter(i => types.has(i.testType));
    }
    if (date) {
      items = items.filter(i => {
        const d = i.testDate ? i.testDate.substring(0, 10) : '';
        return d === date;
      });
    }
    return items;
  });

  currentItem = computed(() => {
    const id = this.currentId();
    return this.filteredItems().find(i => i.id === id) || null;
  });

  currentIndex = computed(() => {
    return this.filteredItems().findIndex(i => i.id === this.currentId());
  });

  currentIndexDisplay = computed(() => {
    const idx = this.currentIndex();
    return idx >= 0 ? idx + 1 : 0;
  });

  prevId = computed(() => {
    const idx = this.currentIndex();
    const items = this.filteredItems();
    return idx > 0 ? items[idx - 1].id : null;
  });

  nextId = computed(() => {
    const idx = this.currentIndex();
    const items = this.filteredItems();
    return idx >= 0 && idx < items.length - 1 ? items[idx + 1].id : null;
  });

  allVisibleChecked = computed(() => {
    const items = this.filteredItems();
    if (items.length === 0) return false;
    return items.every(i => this.checkedIds.has(i.id));
  });

  selectedTestTypesLabel = computed(() => {
    const set = this.selectedTestTypes();
    if (set.size === 0 || set.size === this.testTypes().length) return 'All Test Types';
    if (set.size === 1) return Array.from(set)[0];
    return `${set.size} types`;
  });

  allTestTypesSelected = computed(() => {
    const set = this.selectedTestTypes();
    return set.size === 0 || set.size === this.testTypes().length;
  });

  // ── Lifecycle ──

  ngOnInit() {
    this.reportService.getNav().subscribe({
      next: (data) => {
        this.allItems.set(data.items);
        this.patients.set(data.patients);
        this.testTypes.set(data.testTypes);
        this.loadingNav.set(false);

        // Navigate to the first (most recent) report
        if (data.items.length > 0) {
          this.navigateTo(data.items[0].id);
        }
      },
      error: () => this.loadingNav.set(false),
    });
  }

  ngOnDestroy() {
    this.revokeBlobUrl();
  }

  // ── Navigation ──

  navigateTo(id: string) {
    if (id === this.currentId()) return;
    this.currentId.set(id);
    this.loadReportHtml(id);
  }

  goToPrev() {
    const prev = this.prevId();
    if (prev) this.navigateTo(prev);
  }

  goToNext() {
    const next = this.nextId();
    if (next) this.navigateTo(next);
  }

  // ── Filters ──

  onFilterChange() {
    // If current item is no longer in filtered list, navigate to first filtered item
    const items = this.filteredItems();
    if (items.length > 0 && !items.find(i => i.id === this.currentId())) {
      this.navigateTo(items[0].id);
    }
  }

  clearFilters() {
    this.searchText.set('');
    this.filterPatient.set('');
    this.filterDate.set('');
    this.selectedTestTypes.set(new Set<string>());
    this.onFilterChange();
  }

  toggleTestType(t: string) {
    this.selectedTestTypes.update(set => {
      const next = new Set(set);
      if (next.has(t)) {
        next.delete(t);
      } else {
        next.add(t);
      }
      return next;
    });
    this.onFilterChange();
  }

  toggleAllTestTypes(event: Event) {
    const checked = (event.target as HTMLInputElement).checked;
    this.selectedTestTypes.update(set => {
      const next = new Set<string>();
      if (checked) {
        this.testTypes().forEach(t => next.add(t));
      }
      return next;
    });
    this.onFilterChange();
  }

  isTestTypeSelected(t: string): boolean {
    return this.selectedTestTypes().has(t);
  }

  // ── Checkboxes ──

  toggleAllVisible(event: Event) {
    const checked = (event.target as HTMLInputElement).checked;
    for (const item of this.filteredItems()) {
      if (checked) {
        this.checkedIds.add(item.id);
      } else {
        this.checkedIds.delete(item.id);
      }
    }
  }

  // ── HTML Loading ──

  private loadReportHtml(id: string) {
    this.loadingHtml.set(true);
    this.reportService.getReportHtml(id).subscribe({
      next: (html) => {
        this.revokeBlobUrl();
        const blob = new Blob([html], { type: 'text/html; charset=UTF-8' });
        this.blobUrl = URL.createObjectURL(blob);
        this.iframeSrc.set(this.sanitizer.bypassSecurityTrustResourceUrl(this.blobUrl));
        this.loadingHtml.set(false);
      },
      error: () => this.loadingHtml.set(false),
    });
  }

  private revokeBlobUrl() {
    if (this.blobUrl) {
      URL.revokeObjectURL(this.blobUrl);
      this.blobUrl = null;
    }
  }

  onIframeLoad() {
    try {
      const doc = this.frameRef?.nativeElement?.contentDocument;
      if (doc?.body) {
        const h = doc.body.scrollHeight + 40;
        this.frameRef.nativeElement.style.minHeight = h + 'px';
      }
    } catch { /* cross-origin — ignore */ }
  }

  // ── Print / Download ──

  printFiltered() {
    const checked = Array.from(this.checkedIds);
    const ids = checked.length > 0
      ? checked
      : this.filteredItems().map(i => i.id);
    if (ids.length === 0) return;

    // Open print-multiple directly in new tab — server auto-triggers window.print()
    const url = this.reportService.getPrintMultipleUrl(ids);
    const win = window.open(url, '_blank');
    if (!win) window.location.href = url;
  }

  /** Open current report in new tab — server auto-triggers window.print() */
  printReport() {
    const id = this.currentId();
    if (!id) return;
    const url = this.reportService.getPrintUrl(id);
    const win = window.open(url, '_blank');
    if (!win) window.location.href = url;
  }

  // Legacy aliases kept for any lingering template references
  openPrintView() { this.printReport(); }
  downloadPdf()   { this.printReport(); }
  printCurrent()  { this.printReport(); }

}
