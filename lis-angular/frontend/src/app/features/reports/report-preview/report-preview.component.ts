import { Component, inject, OnInit, OnDestroy, signal, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ReportService } from '../../../core/services/report.service';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';

@Component({
  selector: 'app-report-preview',
  standalone: true,
  imports: [CommonModule, RouterLink],
  template: `
    @if (loading()) {
      <div class="loading">Loading report...</div>
    } @else if (errorMsg()) {
      <div class="error-box">
        <p>{{ errorMsg() }}</p>
        <a routerLink="/reports" class="btn">← Back to Reports</a>
      </div>
    } @else {
      <div class="page-header no-print">
        <h1>Report Preview</h1>
        <div class="header-actions">
          <button class="btn btn-primary" (click)="print()">🖨 Print</button>
          <a routerLink="/reports" class="btn">← Back</a>
        </div>
      </div>

      <div class="iframe-wrapper">
        <iframe
          #reportFrame
          [src]="iframeSrc()"
          frameborder="0"
          class="report-iframe"
          (load)="onIframeLoad()">
        </iframe>
      </div>
    }
  `,
  styles: [`
    .page-header {
      display: flex; justify-content: space-between; align-items: center;
      margin-bottom: 1rem;
    }
    .page-header h1 { font-size: 1.25rem; font-weight: 600; margin: 0; }
    .header-actions { display: flex; gap: 0.5rem; }
    .loading { text-align: center; padding: 3rem; color: #6b7280; }
    .error-box { text-align: center; padding: 3rem; color: #dc2626; }
    .iframe-wrapper {
      background: #e5e7eb;
      border-radius: 6px;
      padding: 1rem;
      display: flex;
      justify-content: center;
      min-height: calc(100vh - 200px);
    }
    .report-iframe {
      width: 8.5in;
      min-height: 11in;
      background: white;
      border: none;
      box-shadow: 0 2px 12px rgba(0,0,0,0.15);
    }

    @media print {
      .no-print { display: none !important; }
      .iframe-wrapper { background: none; padding: 0; border-radius: 0; }
      .report-iframe { box-shadow: none; width: 100%; min-height: 100vh; }
    }
  `]
})
export class ReportPreviewComponent implements OnInit, OnDestroy {
  private reportService = inject(ReportService);
  private route = inject(ActivatedRoute);
  private sanitizer = inject(DomSanitizer);

  @ViewChild('reportFrame') frameRef!: ElementRef<HTMLIFrameElement>;

  loading = signal(true);
  errorMsg = signal('');
  iframeSrc = signal<SafeResourceUrl>('about:blank');

  private blobUrl: string | null = null;

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id')!;
    this.reportService.getReportHtml(id).subscribe({
      next: (html) => {
        const blob = new Blob([html], { type: 'text/html; charset=UTF-8' });
        this.blobUrl = URL.createObjectURL(blob);
        this.iframeSrc.set(this.sanitizer.bypassSecurityTrustResourceUrl(this.blobUrl));
        this.loading.set(false);
      },
      error: (err) => {
        console.error('[report-preview] load error', err);
        this.errorMsg.set('Failed to load report.');
        this.loading.set(false);
      }
    });
  }

  ngOnDestroy() {
    if (this.blobUrl) {
      URL.revokeObjectURL(this.blobUrl);
      this.blobUrl = null;
    }
  }

  onIframeLoad() {
    // Auto-resize iframe to content height
    try {
      const doc = this.frameRef?.nativeElement?.contentDocument;
      if (doc?.body) {
        const h = doc.body.scrollHeight + 40;
        this.frameRef.nativeElement.style.minHeight = h + 'px';
      }
    } catch { /* cross-origin — ignore */ }
  }

  print() {
    try {
      const frame = this.frameRef?.nativeElement;
      if (frame?.contentWindow) {
        frame.contentWindow.focus();
        frame.contentWindow.print();
        return;
      }
    } catch { /* fallback */ }
    window.print();
  }
}
