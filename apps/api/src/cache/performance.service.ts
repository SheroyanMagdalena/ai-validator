import { Injectable, Logger } from '@nestjs/common';

interface PerformanceMetrics {
  cacheHits: number;
  cacheMisses: number;
  comparisonExecutions: number;
  averageComparisonTime: number;
  totalCacheSize: number;
  lastReset: Date;
}

@Injectable()
export class PerformanceService {
  private readonly logger = new Logger(PerformanceService.name);
  private metrics: PerformanceMetrics;

  constructor() {
    this.resetMetrics();
  }

  private resetMetrics(): void {
    this.metrics = {
      cacheHits: 0,
      cacheMisses: 0,
      comparisonExecutions: 0,
      averageComparisonTime: 0,
      totalCacheSize: 0,
      lastReset: new Date(),
    };
  }

  recordCacheHit(): void {
    this.metrics.cacheHits++;
    this.logCacheEfficiency();
  }

  recordCacheMiss(): void {
    this.metrics.cacheMisses++;
    this.logCacheEfficiency();
  }

  recordComparison(executionTime: number): void {
    this.metrics.comparisonExecutions++;
    
    // Calculate running average
    const totalTime = this.metrics.averageComparisonTime * (this.metrics.comparisonExecutions - 1);
    this.metrics.averageComparisonTime = (totalTime + executionTime) / this.metrics.comparisonExecutions;

    this.logger.log(`Comparison completed in ${executionTime}ms. Average: ${this.metrics.averageComparisonTime.toFixed(2)}ms`);
  }

  updateCacheSize(size: number): void {
    this.metrics.totalCacheSize = size;
  }

  getMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }

  getCacheHitRate(): number {
    const total = this.metrics.cacheHits + this.metrics.cacheMisses;
    return total === 0 ? 0 : (this.metrics.cacheHits / total) * 100;
  }

  private logCacheEfficiency(): void {
    const hitRate = this.getCacheHitRate();
    if ((this.metrics.cacheHits + this.metrics.cacheMisses) % 10 === 0) {
      this.logger.log(`Cache hit rate: ${hitRate.toFixed(2)}% (${this.metrics.cacheHits} hits, ${this.metrics.cacheMisses} misses)`);
    }
  }

  reset(): void {
    this.logger.log('Performance metrics reset');
    this.resetMetrics();
  }

  logSummary(): void {
    const hitRate = this.getCacheHitRate();
    this.logger.log(`Performance Summary:
      - Cache Hit Rate: ${hitRate.toFixed(2)}%
      - Total Comparisons: ${this.metrics.comparisonExecutions}
      - Average Execution Time: ${this.metrics.averageComparisonTime.toFixed(2)}ms
      - Cache Size: ${this.metrics.totalCacheSize} items
      - Uptime: ${Math.round((Date.now() - this.metrics.lastReset.getTime()) / 1000)}s`);
  }
}