use core::slice;
use libflate::gzip::Encoder as GzipEncoder;
use std::io::Read;
use std::io::Write;

fn parse_gzip_header(input: &[u8]) -> Option<usize> {
    if input.len() < 10 || input[0] != 0x1f || input[1] != 0x8b || input[2] != 8 {
        return None;
    }
    let flags = input[3];
    if flags & 0xE0 != 0 {
        return None;
    }
    let mut pos = 10usize;
    if flags & 0x04 != 0 {
        if pos + 2 > input.len() {
            return None;
        }
        let xlen = u16::from_le_bytes([input[pos], input[pos + 1]]) as usize;
        pos += 2 + xlen;
    }
    if flags & 0x08 != 0 {
        while pos < input.len() && input[pos] != 0 {
            pos += 1;
        }
        pos += 1;
    }
    if flags & 0x10 != 0 {
        while pos < input.len() && input[pos] != 0 {
            pos += 1;
        }
        pos += 1;
    }
    if flags & 0x02 != 0 {
        pos += 2;
    }
    if input.len() < pos + 8 {
        return None;
    }
    Some(pos)
}

fn copy_out(data: &[u8], out_len_ptr: *mut usize) -> *mut u8 {
    unsafe {
        let ptr = homm3_alloc(data.len());
        if ptr.is_null() {
            return core::ptr::null_mut();
        }
        core::ptr::copy_nonoverlapping(data.as_ptr(), ptr, data.len());
        *out_len_ptr = data.len();
        ptr
    }
}

#[no_mangle]
pub extern "C" fn homm3_gzip_decompress(
    in_ptr: *const u8,
    in_len: usize,
    out_len_ptr: *mut usize,
) -> *mut u8 {
    if in_ptr.is_null() || out_len_ptr.is_null() {
        return core::ptr::null_mut();
    }
    let input = unsafe { slice::from_raw_parts(in_ptr, in_len) };
    let header_len = match parse_gzip_header(input) {
        Some(h) => h,
        None => return core::ptr::null_mut(),
    };
    let expected_size = u32::from_le_bytes([
        input[input.len() - 4],
        input[input.len() - 3],
        input[input.len() - 2],
        input[input.len() - 1],
    ]) as usize;

    let deflate_data = &input[header_len..input.len() - 8];
    let mut out = Vec::new();
    match libflate::deflate::Decoder::new(deflate_data).read_to_end(&mut out) {
        Ok(_) if out.len() == expected_size => copy_out(&out, out_len_ptr),
        _ => core::ptr::null_mut(),
    }
}

#[no_mangle]
pub extern "C" fn homm3_gzip_compress(
    in_ptr: *const u8,
    in_len: usize,
    out_len_ptr: *mut usize,
) -> *mut u8 {
    if in_ptr.is_null() || out_len_ptr.is_null() {
        return core::ptr::null_mut();
    }
    let input = unsafe { slice::from_raw_parts(in_ptr, in_len) };
    let mut out = Vec::new();
    let mut enc = match GzipEncoder::new(&mut out) {
        Ok(e) => e,
        Err(_) => return core::ptr::null_mut(),
    };
    if enc.write_all(input).is_err() {
        return core::ptr::null_mut();
    }
    if enc.finish().into_result().is_err() {
        return core::ptr::null_mut();
    }
    copy_out(&out, out_len_ptr)
}

#[no_mangle]
pub extern "C" fn homm3_free(ptr: *mut u8, len: usize) {
    if ptr.is_null() || len == 0 {
        return;
    }
    unsafe {
        let layout = std::alloc::Layout::from_size_align(len, 1).unwrap();
        std::alloc::dealloc(ptr, layout);
    }
}

#[no_mangle]
pub extern "C" fn homm3_alloc(len: usize) -> *mut u8 {
    if len == 0 {
        return core::ptr::null_mut();
    }
    unsafe {
        let layout = std::alloc::Layout::from_size_align(len, 1).unwrap();
        std::alloc::alloc(layout)
    }
}
