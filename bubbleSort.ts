/**
 * 冒泡排序算法实现
 * @param arr 待排序的数组
 * @returns 排序后的数组
 */
export function bubbleSort(arr: number[]): number[] {
    const n = arr.length;
    
    // 外层循环控制比较轮次
    for (let i = 0; i < n - 1; i++) {
        // 内层循环控制每轮比较次数
        for (let j = 0; j < n - 1 - i; j++) {
            // 如果前一个元素大于后一个元素，则交换它们
            if (arr[j] > arr[j + 1]) {
                [arr[j], arr[j + 1]] = [arr[j + 1], arr[j]]; // ES6解构赋值交换元素
            }
        }
    }
    
    return arr;
}

// 测试用例
const testCases = [
    { input: [5, 3, 8, 4, 2], expected: [2, 3, 4, 5, 8] },
    { input: [1, 2, 3, 4, 5], expected: [1, 2, 3, 4, 5] },
    { input: [5, 4, 3, 2, 1], expected: [1, 2, 3, 4, 5] },
    { input: [], expected: [] },
    { input: [1], expected: [1] },
    { input: [3, 1, 4, 1, 5, 9, 2, 6], expected: [1, 1, 2, 3, 4, 5, 6, 9] }
];

// 执行测试
testCases.forEach((testCase, index) => {
    const result = bubbleSort([...testCase.input]);
    const passed = JSON.stringify(result) === JSON.stringify(testCase.expected);
    console.log(`Test case ${index + 1}: ${passed ? '✓ Passed' : '✗ Failed'}`);
    if (!passed) {
        console.log(`  Input: [${testCase.input}]`);
        console.log(`  Expected: [${testCase.expected}]`);
        console.log(`  Received: [${result}]`);
    }
});