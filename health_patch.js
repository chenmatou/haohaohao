// ====== 节点健康检查补丁 ======
// 功能：真连接验证 + 稳定性100% + 高延迟筛选

(function() {
  'use strict';
  
  // 健康检查配置
  const HEALTH_CONFIG = {
    STABILITY: 1.0,          // 稳定性要求100%
    MAX_LATENCY: 150,        // 最大延迟150ms
    CHECK_TIMEOUT: 5000,     // 检查超时5秒
    REQUIRED_TESTS: 3        // 每个节点至少测试3次
  };
  
  // 节点健康检查器
  class NodeHealthChecker {
    constructor() {
      this.healthyNodes = new Map();
      this.unhealthyNodes = new Set();
      this.stats = {
        totalChecks: 0,
        successfulChecks: 0,
        failedChecks: 0
      };
    }
    
    // 真连接验证
    async verifyRealConnection(node) {
      const startTime = Date.now();
      
      try {
        // 使用fetch API进行真连接测试
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), HEALTH_CONFIG.CHECK_TIMEOUT);
        
        const response = await fetch(node.url, {
          method: 'HEAD',
          mode: 'no-cors',
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (NodeHealthChecker)',
            'Cache-Control': 'no-cache'
          }
        });
        
        clearTimeout(timeoutId);
        const latency = Date.now() - startTime;
        
        // 验证响应
        const isValid = this.validateResponse(response, latency);
        
        return {
          healthy: isValid,
          latency: latency,
          timestamp: Date.now(),
          status: response.status || 0
        };
      } catch (error) {
        return {
          healthy: false,
          latency: null,
          timestamp: Date.now(),
          error: error.message
        };
      }
    }
    
    // 验证响应
    validateResponse(response, latency) {
      // 检查1: 延迟不超过阈值
      if (latency > HEALTH_CONFIG.MAX_LATENCY) return false;
      
      // 检查2: 响应时间合理（不能为0）
      if (latency < 1) return false;
      
      // 检查3: 如果可用，验证状态码
      if (response.status && response.status >= 400) return false;
      
      return true;
    }
    
    // 稳定性测试（100%稳定要求）
    async testStability(node) {
      const results = [];
      
      for (let i = 0; i < HEALTH_CONFIG.REQUIRED_TESTS; i++) {
        const result = await this.verifyRealConnection(node);
        results.push(result);
        
        // 如果任何一次测试失败，节点不稳定
        if (!result.healthy) {
          return {
            stable: false,
            attempt: i + 1,
            reason: result.error || '连接失败'
          };
        }
        
        // 等待一段时间再进行下一次测试
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      
      // 计算平均延迟
      const avgLatency = results.reduce((sum, r) => sum + r.latency, 0) / results.length;
      
      return {
        stable: true,
        attempts: HEALTH_CONFIG.REQUIRED_TESTS,
        avgLatency: avgLatency,
        successRate: 1.0
      };
    }
    
    // 批量健康检查
    async checkAllNodes(nodeList) {
      console.log(`开始健康检查 ${nodeList.length} 个节点...`);
      
      const healthyNodes = [];
      
      for (const node of nodeList) {
        // 进行稳定性测试
        const stabilityTest = await this.testStability(node);
        
        if (stabilityTest.stable) {
          // 稳定性通过，进行最终验证
          const finalCheck = await this.verifyRealConnection(node);
          
          if (finalCheck.healthy) {
            healthyNodes.push({
              ...node,
              latency: finalCheck.latency,
              avgLatency: stabilityTest.avgLatency,
              score: this.calculateScore(finalCheck.latency, stabilityTest.avgLatency)
            });
            
            this.healthyNodes.set(node.id, {
              ...node,
              health: finalCheck,
              stability: stabilityTest
            });
            
            this.stats.successfulChecks++;
          } else {
            this.unhealthyNodes.add(node.id);
            this.stats.failedChecks++;
          }
        } else {
          this.unhealthyNodes.add(node.id);
          this.stats.failedChecks++;
        }
        
        this.stats.totalChecks++;
      }
      
      // 按得分排序（延迟越低得分越高）
      const sortedNodes = healthyNodes.sort((a, b) => b.score - a.score);
      
      return {
        healthy: sortedNodes,
        stats: {
          ...this.stats,
          healthRate: (this.stats.successfulChecks / this.stats.totalChecks * 100).toFixed(1) + '%'
        }
      };
    }
    
    // 计算节点得分
    calculateScore(currentLatency, avgLatency) {
      // 基础得分基于延迟
      const latencyScore = Math.max(0, 100 - currentLatency);
      
      // 稳定性奖励
      const stabilityBonus = Math.abs(currentLatency - avgLatency) < 20 ? 20 : 0;
      
      return latencyScore + stabilityBonus;
    }
    
    // 获取最佳节点
    getBestNode() {
      let bestNode = null;
      let highestScore = -1;
      
      for (const [id, node] of this.healthyNodes) {
        if (node.health.latency < highestScore || highestScore === -1) {
          highestScore = node.health.latency;
          bestNode = node;
        }
      }
      
      return bestNode;
    }
  }
  
  // 创建全局健康检查器
  if (typeof globalThis !== 'undefined') {
    globalThis.BPBHealthChecker = new NodeHealthChecker();
  }
  
  console.log('✅ 节点健康检查器已加载');
  console.log('📊 配置: 真连接验证 | 100%稳定性 | 延迟筛选(<150ms)');
})();
// ====== 补丁结束 ======
